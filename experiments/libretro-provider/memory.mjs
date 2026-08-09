import { readAddress } from "../libretro-direct-host/address-translate.mjs";

export const MAX_READ_BYTES = 1024 * 1024;

function regionIndex(regionId) {
  const match = /^region-(\d+)$/.exec(String(regionId));
  if (!match) throw new RangeError(`Unknown memory region ${regionId}`);
  return Number(match[1]);
}

export function describeMemoryRegions(descriptors) {
  return descriptors.map((descriptor, index) => ({
    id: `region-${index}`,
    addrspace: descriptor.addrspace ?? null,
    start: descriptor.start,
    length: descriptor.len,
    offset: descriptor.offset,
    select: descriptor.select,
    disconnect: descriptor.disconnect,
    accessible: Boolean(descriptor.ptr),
  }));
}

export function readMemory(descriptors, regionId, offset, length, readBuffer) {
  const index = regionIndex(regionId);
  const descriptor = descriptors[index];
  if (!descriptor) throw new RangeError(`Unknown memory region ${regionId}`);
  if (!Number.isInteger(offset) || offset < 0) throw new RangeError("Memory offset must be a non-negative integer");
  if (!Number.isInteger(length) || length < 1 || length > MAX_READ_BYTES) {
    throw new RangeError(`Memory length must be an integer from 1 to ${MAX_READ_BYTES}`);
  }
  if (!descriptor.ptr) throw new Error(`Memory region ${regionId} is inaccessible`);
  if (offset + length > descriptor.len) throw new RangeError(`Memory request exceeds ${regionId} bounds`);

  const bytes = Buffer.allocUnsafe(length);
  for (let index = 0; index < length; index += 1) {
    const absolute = descriptor.start + offset + index;
    bytes[index] = readAddress([descriptor], absolute, {
      readBuffer: (matched, bufferOffset) => readBuffer(matched, bufferOffset),
    });
  }
  return bytes;
}

export function readValue(descriptors, regionId, offset, width, readBuffer) {
  const bytes = readMemory(descriptors, regionId, offset, width, readBuffer);
  if (width === 1) return bytes[0];
  if (width === 2) return bytes.readUInt16LE(0);
  if (width === 4) return bytes.readUInt32LE(0);
  throw new RangeError(`Unsupported read width ${width}`);
}
