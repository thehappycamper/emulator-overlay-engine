import assert from "node:assert/strict";
import test from "node:test";

import {
  descriptorMatches,
  findDescriptorForAddress,
  matchDescriptorForAddress,
  readAddress,
  translateAddressToBufferOffset,
} from "../address-translate.mjs";

// Real mGBA libretro core registration, transcribed field-for-field from
// mgba-emu/mgba's src/platform/libretro/libretro.c `_setupMaps()` (GBA
// branch, `descs[0]`/`descs[1]`), not a simplified stand-in: EWRAM/IWRAM are
// registered with `select = 0xFF000000` (only the top address byte selects
// the region) and `disconnect = 0` (the struct is `memset` to zero and
// disconnect is never set for these two entries). A prior version of this
// test file used `select: 0` for these descriptors, which is NOT what the
// real core registers and exercised a different (and, for a non-zero-select
// descriptor, incorrect) code path than what actually runs against mGBA.
const EWRAM_DESCRIPTOR = Object.freeze({
  ptr: "fake-ewram-ptr",
  offset: 0,
  start: 0x02000000,
  select: 0xff000000,
  disconnect: 0,
  len: 0x40000,
  addrspace: null,
});

const IWRAM_DESCRIPTOR = Object.freeze({
  ptr: "fake-iwram-ptr",
  offset: 0,
  start: 0x03000000,
  select: 0xff000000,
  disconnect: 0,
  len: 0x8000,
  addrspace: null,
});

const DESCRIPTORS = Object.freeze([EWRAM_DESCRIPTOR, IWRAM_DESCRIPTOR]);

test("descriptorMatches selects by top-byte select mask, matching real mGBA EWRAM/IWRAM registration", () => {
  assert.equal(descriptorMatches(EWRAM_DESCRIPTOR, 0x02000000), true);
  assert.equal(descriptorMatches(EWRAM_DESCRIPTOR, 0x0203ffff), true); // last real EWRAM byte
  assert.equal(descriptorMatches(EWRAM_DESCRIPTOR, 0x03000000), false); // IWRAM's top byte, not EWRAM's
  assert.equal(descriptorMatches(EWRAM_DESCRIPTOR, 0x01ffffff), false);
});

test("descriptorMatches rejects an address whose select-matched offset exceeds len (does not fall back to a range check)", () => {
  // 0x02040000 has the same top byte (0x02) as EWRAM's start, so the select
  // mask matches, but the real, physically-backed buffer is only 0x40000
  // bytes - this address is in the unmapped remainder of the selected page
  // and must not be treated as covered by this descriptor.
  assert.equal(descriptorMatches(EWRAM_DESCRIPTOR, 0x02040000), false);
  assert.equal(descriptorMatches(EWRAM_DESCRIPTOR, 0x02ffffff), false);
});

test("findDescriptorForAddress picks the correct region and returns null when nothing matches at all", () => {
  assert.equal(findDescriptorForAddress(DESCRIPTORS, 0x020244ec), EWRAM_DESCRIPTOR);
  assert.equal(findDescriptorForAddress(DESCRIPTORS, 0x030026f9), IWRAM_DESCRIPTOR);
  assert.equal(findDescriptorForAddress(DESCRIPTORS, 0x08000000), null);
});

test("findDescriptorForAddress rejects (does not return null) when the only matching descriptor has no backing pointer", () => {
  // This is deliberately different from "nothing matches" (which returns
  // null, see the test above): a descriptor with ptr: null actively claims
  // the address per libretro.h precedence, it just has no accessible
  // memory there. Silently treating this the same as "no descriptor covers
  // this address at all" would hide a real inaccessibility signal from the
  // caller.
  const unbacked = { ...EWRAM_DESCRIPTOR, ptr: null };
  assert.throws(
    () => findDescriptorForAddress([unbacked], 0x02000000),
    /no backing pointer/,
  );
});

test("first-descriptor-claims precedence: an inaccessible first match blocks a later, accessible, overlapping descriptor", () => {
  // Two descriptors both cover 0x02000000: the first has no backing
  // pointer, the second (listed later in the array) does. Per libretro.h,
  // "If multiple memory descriptors can claim a particular byte, the first
  // one defined in the retro_memory_descriptor array applies" - so the
  // inaccessible first descriptor wins the claim, and the second,
  // accessible descriptor must never be consulted, even though it also
  // covers this exact address and could otherwise satisfy the read.
  const inaccessibleFirst = { ...EWRAM_DESCRIPTOR, ptr: null };
  const accessibleSecond = { ...EWRAM_DESCRIPTOR, ptr: "would-be-readable" };
  const overlapping = Object.freeze([inaccessibleFirst, accessibleSecond]);

  assert.throws(
    () => findDescriptorForAddress(overlapping, 0x02000000),
    /no backing pointer/,
  );
  assert.throws(
    () => readAddress(overlapping, 0x02000000, { readBuffer: () => 0 }),
    /no backing pointer/,
  );

  // matchDescriptorForAddress itself must report the first (inaccessible)
  // descriptor as the match, not silently skip to the second.
  const match = matchDescriptorForAddress(overlapping, 0x02000000);
  assert.equal(match.descriptor, inaccessibleFirst);
});

test("first-descriptor-claims precedence: an accessible first match wins over a later, also-matching, overlapping descriptor", () => {
  // The positive counterpart of the test above: when the first-listed
  // matching descriptor IS accessible, it must be the one used, even
  // though a later descriptor also covers the same address (with a
  // different offset base, proving the second one was never consulted).
  const first = { ...EWRAM_DESCRIPTOR, ptr: "first-buffer", offset: 0 };
  const second = { ...EWRAM_DESCRIPTOR, ptr: "second-buffer", offset: 0x9999 };
  const overlapping = Object.freeze([first, second]);

  assert.equal(findDescriptorForAddress(overlapping, 0x02000000), first);
  const reads = [];
  readAddress(overlapping, 0x02000000, {
    readBuffer: (descriptor, offset) => {
      reads.push({ ptr: descriptor.ptr, offset });
      return 1;
    },
  });
  assert.deepEqual(reads, [{ ptr: "first-buffer", offset: 0 }]);
});

test("translateAddressToBufferOffset resolves our existing Emerald address constants against the real EWRAM descriptor shape", () => {
  // This is the specific claim the task asked to verify: our existing
  // Emerald address constants (playerPartyCount = 0x020244E9, etc.) resolve
  // correctly through the *actual* mGBA descriptor (select=0xFF000000,
  // disconnect=0), not just through a simplified select=0 stand-in.
  const partyCountAddress = 0x020244e9;
  const offset = translateAddressToBufferOffset(EWRAM_DESCRIPTOR, partyCountAddress);
  assert.equal(offset, 0x244e9);
  assert.ok(offset < EWRAM_DESCRIPTOR.len, "offset must be within the 256 KiB EWRAM buffer");
});

test("translateAddressToBufferOffset adds descriptor.offset into the computed buffer index", () => {
  // A descriptor whose backing buffer pointer is shared with another region
  // (per libretro.h: "it is recommended to use this field for address
  // calculations instead of performing arithmetic on ptr") - offset must be
  // added on top of the address-relative computation, for both the
  // zero-select and non-zero-select branches.
  const flatWithOffset = { ptr: "shared-ptr", offset: 0x1000, start: 0x100, select: 0, disconnect: 0, len: 0x100 };
  assert.equal(translateAddressToBufferOffset(flatWithOffset, 0x110), 0x1010);

  // select=0xff00 means the high byte must match start's high byte (0);
  // the low byte (where 0x42 lives) is free to vary within len.
  const selectedWithOffset = { ptr: "shared-ptr", offset: 0x2000, start: 0, select: 0xff00, disconnect: 0, len: 0x100 };
  assert.equal(translateAddressToBufferOffset(selectedWithOffset, 0x42), 0x2042);
});

test("zero-select descriptors ignore disconnect entirely, per libretro.h's 'complete mapping' semantics", () => {
  // libretro.h: "[select] can be zero, in which case start and len
  // represent the complete mapping for this region of memory (i.e. each
  // byte is mapped exactly once)." RetroArch's own reference implementation
  // (rc_libretro_memory_get_descriptor) does not consult `disconnect` at
  // all when `select === 0` - only when `select !== 0`. A descriptor
  // combining select:0 with a non-zero disconnect is not a real-world
  // shape, but our matching code must still take the same select-based
  // branch RetroArch takes, not silently apply disconnect anyway.
  const zeroSelectWithDisconnect = { start: 0x1000, len: 0x10, offset: 0, disconnect: 0x100, select: 0 };
  assert.equal(descriptorMatches(zeroSelectWithDisconnect, 0x1004), true);
  assert.equal(translateAddressToBufferOffset(zeroSelectWithDisconnect, 0x1004), 0x4);
  // 0x1104 is outside [0x1000, 0x1010) - with disconnect ignored (as it
  // must be when select is 0), this is simply out of range, not mirrored.
  assert.equal(descriptorMatches(zeroSelectWithDisconnect, 0x1104), false);
});

test("non-zero select combined with a nontrivial (multi-bit, non-adjacent) disconnect mask collapses address bits correctly", () => {
  // Hand-derived and independently verified by direct bit extraction (not
  // just by re-running the implementation): start=0, select=0x80 (bit 7
  // must be clear), disconnect=0x22 (bits 1 and 5 - two non-adjacent bits).
  // Address 0x2B = 0010_1011: bit7=0 (selects this descriptor); removing
  // bits 1 and 5 and packing the remaining bits (7,6,4,3,2,0) = 0,0,0,1,0,1
  // = 0b000101 = 5.
  const descriptor = { ptr: "fake", offset: 0, start: 0, select: 0x80, disconnect: 0x22, len: 0x20 };
  assert.equal(descriptorMatches(descriptor, 0x2b), true);
  assert.equal(translateAddressToBufferOffset(descriptor, 0x2b), 5);

  // 0x86 = 1000_0110 has bit 7 set, which differs from start's bit 7 (0) -
  // the select mask must reject this address outright, regardless of
  // disconnect.
  assert.equal(descriptorMatches(descriptor, 0x86), false);
});

test("non-zero select with an adjacent multi-bit disconnect mask (mirrored bank, SNES-LoROM-shaped)", () => {
  // Hand-derived: start=0, select=0xC0 (bits 6-7 select the bank),
  // disconnect=0x30 (bits 4-5 are mirrored/ignored), len=0x10 (16-byte
  // buffer, addressed by bits 0-3 after bits 4-5 are collapsed away).
  // Address 0x35 = 0011_0101: bits6-7=00 match start's bits6-7=00; removing
  // bits 4-5 (both 1) and packing remaining bits (7,6,3,2,1,0) = 0,0,0,1,0,1
  // = 0b000101 = 5.
  const descriptor = { ptr: "fake", offset: 0, start: 0, select: 0xc0, disconnect: 0x30, len: 0x10 };
  assert.equal(translateAddressToBufferOffset(descriptor, 0x35), 5);

  // Same low nibble bits, different disconnect-bit values (0 instead of 1)
  // and different bank - still collapses correctly and is still in-range.
  assert.equal(translateAddressToBufferOffset(descriptor, 0x05), 5);
});

test("a select match whose collapsed offset exceeds len is rejected, not silently truncated", () => {
  // select matches (bit 7 clear), but after collapsing away the single
  // disconnect bit the reduced address (0x20) is not less than len (0x10) -
  // RetroArch's reference falls through to "no match" here rather than
  // wrapping or clamping.
  const descriptor = { ptr: "fake", offset: 0, start: 0, select: 0x80, disconnect: 0x8, len: 0x10 };
  assert.equal(descriptorMatches(descriptor, 0x48), false);
});

test("out-of-scope: a len:0 (borderless) descriptor never matches, even when select/start otherwise would cover the address", () => {
  // Documented, disclosed limitation (see the module-level comment): this
  // GBA spike does not implement libretro.h's "len: 0 means bounded only by
  // select/disconnect" borderless-descriptor case. Real mGBA GBA
  // descriptors always specify a concrete len, so this is not a gap for
  // this spike's actual target, but it is worth pinning the behavior
  // explicitly rather than leaving it as an unstated side effect: with
  // select=0x80 and start=0, address 0x00 would satisfy the select match,
  // but len=0 means the unsigned "reduced < len" bounds check can never be
  // true, so the descriptor never matches, for any address.
  const borderless = { ptr: "fake", offset: 0, start: 0, select: 0x80, disconnect: 0, len: 0 };
  assert.equal(descriptorMatches(borderless, 0x00), false);
  assert.equal(descriptorMatches(borderless, 0x01), false);
  assert.equal(findDescriptorForAddress([borderless], 0x00), null);
});

test("translateAddressToBufferOffset rejects an address outside the descriptor's range", () => {
  assert.throws(
    () => translateAddressToBufferOffset(EWRAM_DESCRIPTOR, 0x04000000),
    /is not within descriptor/,
  );
});

test("readAddress locates the descriptor and delegates the actual byte read", () => {
  const reads = [];
  const value = readAddress(DESCRIPTORS, 0x020244e9, {
    readBuffer: (descriptor, offset) => {
      reads.push({ addrspace: descriptor.addrspace, offset });
      return 1;
    },
  });
  assert.equal(value, 1);
  assert.deepEqual(reads, [{ addrspace: null, offset: 0x244e9 }]);
});

test("readAddress throws a clear error when no descriptor covers the address", () => {
  assert.throws(
    () => readAddress(DESCRIPTORS, 0x08000000, { readBuffer: () => 0 }),
    /No published memory descriptor covers address/,
  );
});
