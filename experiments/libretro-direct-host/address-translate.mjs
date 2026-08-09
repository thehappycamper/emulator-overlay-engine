// Pure translation from an absolute emulated-hardware address (e.g. a GBA
// EWRAM address like 0x020244EC) to a byte offset within a libretro memory
// descriptor's backing buffer. Kept dependency-free and separately testable
// from the FFI/host code.
//
// The matching/offset algorithm below is transcribed from RetroArch's own
// reference implementation of this exact translation
// (deps/rcheevos/src/rc_libretro.c, function
// rc_libretro_memory_get_descriptor(), RetroArch master branch as of
// 2026-08), not re-derived from the libretro.h doc comment alone. That
// reference is what "RetroArch frontend behavior" concretely means for this
// spike, and it differs from a naive reading of the header in two ways this
// module intentionally matches:
//
// 1. When `select` is zero, the descriptor is documented as a "complete
//    mapping" (each byte mapped exactly once) and `disconnect` is NOT
//    consulted at all for either matching or offset computation - only a
//    plain `start <= address < start + len` range check applies.
// 2. When `select` is non-zero, `disconnect` bits are not simply masked to
//    zero; they are removed from the address and the remaining bits are
//    collapsed (shifted down to close the gap), per RetroArch's
//    `mmap_reduce`-derived bit-collapse loop. A naive `address & ~disconnect`
//    leaves gaps in the numeric value and produces wrong (usually
//    out-of-bounds) offsets for any real bank-selecting/mirrored descriptor.
//    A `select`-matched address whose collapsed offset still exceeds `len`
//    is NOT a match for that descriptor (RetroArch falls through to the next
//    descriptor in the array in that case), so matching and offset
//    computation cannot be separated into independent steps - this module
//    resolves both together internally for that reason.

// Real mGBA libretro core registration (confirmed against
// mgba-emu/mgba's src/platform/libretro/libretro.c `_setupMaps()`, GBA
// branch) sets `select = 0xFF000000` and `disconnect = 0` for both EWRAM and
// IWRAM - i.e. only the top address byte selects the region; the low 24
// bits index directly into the buffer, bounded by `len`. `select` being
// non-zero there means EWRAM/IWRAM addresses go through the non-zero-select
// branch below, not the naive flat-range branch a `select: 0` assumption
// would suggest.
//
// Out of scope for this GBA spike: libretro.h documents `len: 0` as meaning
// "bounded only by select/disconnect" (an intentionally borderless
// descriptor, used in its own SNES example only as a NULL-ptr sentinel to
// report the overall address-space size). `resolveOffsetWithinDescriptor`'s
// `select !== 0` branch checks `reduced < len`, so a `len: 0` descriptor can
// never satisfy that comparison (nothing is less than 0 for the unsigned
// values in play here) and therefore can never produce a match - this is
// the same behavior RetroArch's own `rc_libretro_memory_get_descriptor`
// reference has for `len: 0`, not a gap introduced by this module. Real GBA
// descriptors (mGBA's own registration, confirmed above) always specify a
// concrete `len`, so this spike does not need, and does not implement,
// meaningful support for borderless `len: 0` descriptors.

function collapseDisconnectBits(address, disconnectMask) {
  // Removes each set bit of `disconnectMask` from `address` and shifts the
  // remaining higher bits down to close the resulting gap, one disconnect
  // bit at a time, processing from the lowest set bit upward. This is a
  // direct translation of RetroArch's `mmap_reduce`-derived loop in
  // rc_libretro_memory_get_descriptor(): each iteration peels off the
  // current lowest set bit of the (progressively right-shifted) mask,
  // splits `address` into "keep as-is" bits below that position and "shift
  // down by one" bits above it, then advances the mask past the bit it just
  // consumed.
  let value = address >>> 0;
  let mask = disconnectMask >>> 0;
  while (mask !== 0) {
    const keepBelow = ((mask - 1) & ~mask) >>> 0;
    value = ((value & keepBelow) | ((value >>> 1) & (~keepBelow >>> 0))) >>> 0;
    mask = ((mask & (mask - 1)) >>> 1) >>> 0;
  }
  return value;
}

// Resolves `address` against a single descriptor, returning the byte offset
// within that descriptor's backing buffer (already including
// `descriptor.offset`), or `null` if the address does not belong to this
// descriptor - either because it fails the start/select match, or (for the
// non-zero-select branch) because its collapsed offset falls outside `len`.
function resolveOffsetWithinDescriptor(descriptor, address) {
  const start = descriptor.start >>> 0;
  const select = (descriptor.select || 0) >>> 0;
  const len = descriptor.len >>> 0;
  const offset = descriptor.offset || 0;
  const addr = address >>> 0;

  if (select === 0) {
    if (addr >= start && addr < start + len) {
      return offset + (addr - start);
    }
    return null;
  }

  if ((((start ^ addr) >>> 0) & select) !== 0) {
    return null;
  }

  const reduced = collapseDisconnectBits((addr - start) >>> 0, descriptor.disconnect || 0);
  if (reduced < len) {
    return offset + reduced;
  }
  return null;
}

export function descriptorMatches(descriptor, address) {
  return resolveOffsetWithinDescriptor(descriptor, address) !== null;
}

// Finds the descriptor that "claims" `address`, honoring libretro.h's
// documented first-descriptor precedence exactly: "If multiple memory
// descriptors can claim a particular byte, the first one defined in the
// retro_memory_descriptor array applies." This is evaluated purely by
// start/select/disconnect/len match - `ptr` (whether the descriptor is
// actually backed by accessible memory) is NOT part of the matching
// criteria and must not affect which descriptor wins. A NULL `ptr` is
// libretro.h's documented way to say "no accessible memory at this
// address," not "skip this descriptor and keep looking" - RetroArch's own
// reference implementation (rc_libretro_memory_get_descriptor) matches
// this way too: it returns whichever descriptor matches first regardless of
// `ptr`, and leaves ptr-nullness handling to the caller.
//
// Returns `{ descriptor, offset }` for the first matching descriptor
// (whether or not it has a backing pointer), or `null` if no descriptor in
// the array matches `address` at all.
export function matchDescriptorForAddress(descriptors, address) {
  for (const descriptor of descriptors) {
    const offset = resolveOffsetWithinDescriptor(descriptor, address);
    if (offset !== null) {
      return { descriptor, offset };
    }
  }
  return null;
}

function rejectInaccessibleMatch(match, address) {
  throw new RangeError(
    `Address 0x${address.toString(16)} is claimed by memory descriptor addrspace=` +
      `${match.descriptor.addrspace ?? "(none)"} start=0x${match.descriptor.start.toString(16)}, ` +
      `which has no backing pointer (ptr is null/absent). Per Libretro first-descriptor-claims ` +
      `precedence this address is inaccessible; refusing to fall through to a later, possibly ` +
      `accessible descriptor that also happens to cover this address.`,
  );
}

// Returns the descriptor that claims `address`, or `null` if none does.
// Throws if the first (and therefore only relevant, per precedence)
// claiming descriptor has no backing pointer - see matchDescriptorForAddress
// above and rejectInaccessibleMatch's message for why this must not
// silently fall through to a later descriptor instead.
export function findDescriptorForAddress(descriptors, address) {
  const match = matchDescriptorForAddress(descriptors, address);
  if (!match) {
    return null;
  }
  if (!match.descriptor.ptr) {
    rejectInaccessibleMatch(match, address);
  }
  return match.descriptor;
}

export function translateAddressToBufferOffset(descriptor, address) {
  const offset = resolveOffsetWithinDescriptor(descriptor, address);
  if (offset === null) {
    throw new RangeError(
      `Address 0x${address.toString(16)} is not within descriptor start=0x${descriptor.start.toString(16)} ` +
        `select=0x${(descriptor.select || 0).toString(16)} len=0x${descriptor.len.toString(16)}`,
    );
  }
  return offset;
}

export function readAddress(descriptors, address, { readBuffer }) {
  const match = matchDescriptorForAddress(descriptors, address);
  if (!match) {
    throw new RangeError(`No published memory descriptor covers address 0x${address.toString(16)}`);
  }
  if (!match.descriptor.ptr) {
    rejectInaccessibleMatch(match, address);
  }
  return readBuffer(match.descriptor, match.offset);
}
