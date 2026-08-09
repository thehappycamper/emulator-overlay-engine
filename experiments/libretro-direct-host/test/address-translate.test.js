import assert from "node:assert/strict";
import test from "node:test";

import {
  descriptorMatches,
  findDescriptorForAddress,
  readAddress,
  translateAddressToBufferOffset,
} from "../address-translate.mjs";

// Synthetic descriptors shaped like mGBA's real libretro core registration
// (GBA_BASE_EWRAM = 0x02000000, 256 KiB; GBA_BASE_IWRAM = 0x03000000, 32 KiB),
// confirmed structurally against mgba-emu/mgba's src/platform/libretro/libretro.c
// during this task's research. Not captured from a live core run in this
// environment - see the task record for why.
const EWRAM_DESCRIPTOR = Object.freeze({
  ptr: "fake-ewram-ptr",
  offset: 0,
  start: 0x02000000,
  select: 0,
  disconnect: 0,
  len: 0x40000,
  addrspace: null,
});

const IWRAM_DESCRIPTOR = Object.freeze({
  ptr: "fake-iwram-ptr",
  offset: 0,
  start: 0x03000000,
  select: 0,
  disconnect: 0,
  len: 0x8000,
  addrspace: null,
});

const DESCRIPTORS = Object.freeze([EWRAM_DESCRIPTOR, IWRAM_DESCRIPTOR]);

test("descriptorMatches uses a simple range check when select is zero", () => {
  assert.equal(descriptorMatches(EWRAM_DESCRIPTOR, 0x02000000), true);
  assert.equal(descriptorMatches(EWRAM_DESCRIPTOR, 0x0203ffff), true);
  assert.equal(descriptorMatches(EWRAM_DESCRIPTOR, 0x02040000), false);
  assert.equal(descriptorMatches(EWRAM_DESCRIPTOR, 0x01ffffff), false);
});

test("descriptorMatches honors a non-zero select mask", () => {
  // A mirrored region every 0x8000 bytes, matched by the high bits only -
  // exercises the general algorithm, not just the GBA flat-memory case.
  const mirrored = { start: 0x03000000, select: 0xff000000, len: 0x8000 };
  assert.equal(descriptorMatches(mirrored, 0x03000000), true);
  assert.equal(descriptorMatches(mirrored, 0x03ff0000), true); // same high byte
  assert.equal(descriptorMatches(mirrored, 0x04000000), false); // different high byte
});

test("findDescriptorForAddress picks the correct region and ignores descriptors with no backing pointer", () => {
  assert.equal(findDescriptorForAddress(DESCRIPTORS, 0x020244ec), EWRAM_DESCRIPTOR);
  assert.equal(findDescriptorForAddress(DESCRIPTORS, 0x030026f9), IWRAM_DESCRIPTOR);
  assert.equal(findDescriptorForAddress(DESCRIPTORS, 0x08000000), null);

  const unbacked = { ...EWRAM_DESCRIPTOR, ptr: null };
  assert.equal(findDescriptorForAddress([unbacked], 0x02000000), null);
});

test("translateAddressToBufferOffset performs plain subtraction when disconnect is zero", () => {
  // This is the specific claim the task asked to verify: our existing
  // Emerald address constants (playerPartyCount = 0x020244E9, etc.) do not
  // need bit-masking against mGBA's EWRAM descriptor - only a subtraction
  // of the descriptor's start address, which is what "translation" means
  // here. Using the raw 0x02024... value as a buffer index directly would
  // be wrong (and far out of the 0x40000-byte buffer's bounds).
  const partyCountAddress = 0x020244e9;
  const offset = translateAddressToBufferOffset(EWRAM_DESCRIPTOR, partyCountAddress);
  assert.equal(offset, 0x244e9);
  assert.ok(offset < EWRAM_DESCRIPTOR.len, "offset must be within the 256 KiB EWRAM buffer");
});

test("translateAddressToBufferOffset clears disconnect bits before indexing", () => {
  // A synthetic core whose backing buffer is only 0x10 bytes, mirrored by
  // ignoring bit 0x100 - the disconnect field's documented purpose.
  const mirroredDescriptor = { start: 0x1000, len: 0x10, offset: 0, disconnect: 0x100, select: 0 };
  assert.equal(translateAddressToBufferOffset(mirroredDescriptor, 0x1004), 0x4);
  assert.equal(translateAddressToBufferOffset(mirroredDescriptor, 0x1104), 0x4);
});

test("translateAddressToBufferOffset rejects an address outside the descriptor's range", () => {
  assert.throws(
    () => translateAddressToBufferOffset(EWRAM_DESCRIPTOR, 0x03000000),
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
