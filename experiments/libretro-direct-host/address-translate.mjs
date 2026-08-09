// Pure translation from an absolute emulated-hardware address (e.g. a GBA
// EWRAM address like 0x020244EC) to a byte offset within a libretro memory
// descriptor's backing buffer. Kept dependency-free and separately testable
// from the FFI/host code, per the descriptor semantics documented in
// libretro.h's RETRO_ENVIRONMENT_SET_MEMORY_MAPS section: a descriptor's
// `select` mask identifies which address bits must match `start` for the
// address to fall in that descriptor's range, and `disconnect` identifies
// address bits that do not correspond to real buffer bytes (used for
// mirrored/aliased regions) and must be cleared before indexing the buffer.

export function descriptorMatches(descriptor, address) {
  // Disconnect bits are "don't care" for matching too: an address that only
  // differs from an in-range one by a disconnected bit still belongs to this
  // descriptor (that is the mirroring `disconnect` exists to describe), so
  // they must be masked out before either the select-mask or plain-range
  // comparison below, not only when computing the final buffer offset.
  const relevant = descriptor.disconnect ? address & ~descriptor.disconnect : address;
  const select = descriptor.select >>> 0 || descriptor.select;
  if (select === 0) {
    return relevant >= descriptor.start && relevant < descriptor.start + descriptor.len;
  }
  return matchBits(relevant, select) === matchBits(descriptor.start, select);
}

function matchBits(value, mask) {
  // Both operands may exceed 32 bits for some systems; GBA addresses do not,
  // so plain bitwise ops (which coerce to 32-bit in JS) are safe here.
  return value & mask;
}

export function findDescriptorForAddress(descriptors, address) {
  return descriptors.find((descriptor) => descriptor.ptr && descriptorMatches(descriptor, address)) ?? null;
}

export function translateAddressToBufferOffset(descriptor, address) {
  if (!descriptorMatches(descriptor, address)) {
    throw new RangeError(
      `Address 0x${address.toString(16)} is not within descriptor start=0x${descriptor.start.toString(16)} len=0x${descriptor.len.toString(16)}`,
    );
  }
  const relative = address - descriptor.start;
  const disconnected = descriptor.disconnect ? relative & ~descriptor.disconnect : relative;
  return descriptor.offset + disconnected;
}

export function readAddress(descriptors, address, { readBuffer }) {
  const descriptor = findDescriptorForAddress(descriptors, address);
  if (!descriptor) {
    throw new RangeError(`No published memory descriptor covers address 0x${address.toString(16)}`);
  }
  const bufferOffset = translateAddressToBufferOffset(descriptor, address);
  return readBuffer(descriptor, bufferOffset);
}
