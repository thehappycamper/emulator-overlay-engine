// Thin translation layer between the isolated, fully generic Libretro
// provider (experiments/libretro-provider/ - no Emerald/Pokemon knowledge
// of any kind) and the existing game-owned Emerald acquisition reader
// contract (adapters/pokemon-emerald-us-rev0/emerald-us-rev0.js's
// `readEmeraldAcquisition(reader)`, which requires a synchronous
// `{read8(address), read16(address), read32(address)}` object).
//
// Libretro IPC is inherently asynchronous (a child-process round trip per
// request), while `readEmeraldAcquisition` calls `reader.read8/16/32`
// synchronously, dozens of times per acquisition (once per Pokemon field,
// times up to seven Pokemon). Bridging this is not optional plumbing - it
// is the one genuinely new problem this adapter exists to solve, and it is
// solved the same way a real hardware/BizHawk/mGBA reader already is
// synchronous by construction: fetch a bounded memory snapshot with a
// small, fixed number of async IPC calls (one per verified region), then
// hand `readEmeraldAcquisition` a synchronous reader backed by that
// already-fetched snapshot. No Emerald memory address appears anywhere in
// this file - only the two GBA-wide EWRAM/IWRAM region boundaries, the
// same generic memory geography every GBA game shares.

const GBA_EWRAM = Object.freeze({ name: "EWRAM", start: 0x02000000, length: 0x40000 });
const GBA_IWRAM = Object.freeze({ name: "IWRAM", start: 0x03000000, length: 0x8000 });

// The only two GBA memory regions this adapter ever reads or trusts.
// Mirrors adapters/bizhawk/gba-memory-domains.js's own EWRAM/IWRAM
// constants exactly - both providers make the identical, disclosed claim
// about which parts of the address space are "verified."
export const VERIFIED_GBA_REGIONS = Object.freeze([GBA_EWRAM, GBA_IWRAM]);

export class LibretroEmeraldMemoryMapError extends RangeError {
  constructor(message) {
    super(message);
    this.name = "LibretroEmeraldMemoryMapError";
  }
}

// Finds, among the Libretro provider's own discovered `memoryRegions`
// (from its `initialize` response), the region that fully contains each
// verified GBA domain (EWRAM, IWRAM), and confirms it is marked
// accessible. Fails closed - a missing, undersized, or inaccessible
// region is a configuration/core problem this adapter must not paper
// over by guessing or falling back to a different region.
export function resolveVerifiedRegions(memoryRegions) {
  if (!Array.isArray(memoryRegions)) {
    throw new LibretroEmeraldMemoryMapError("Libretro provider did not publish a memoryRegions array");
  }

  const resolved = {};
  for (const domain of VERIFIED_GBA_REGIONS) {
    const match = memoryRegions.find(
      (region) =>
        Number.isInteger(region?.start) &&
        Number.isInteger(region?.length) &&
        region.start <= domain.start &&
        domain.start + domain.length <= region.start + region.length,
    );
    if (!match) {
      throw new LibretroEmeraldMemoryMapError(
        `No published Libretro memory region covers GBA ${domain.name} (0x${domain.start.toString(16)}-0x${(domain.start + domain.length).toString(16)})`,
      );
    }
    if (!match.accessible) {
      throw new LibretroEmeraldMemoryMapError(`Libretro region ${match.id} covering GBA ${domain.name} is not accessible`);
    }
    // The domain may start mid-region (a region can be larger than the
    // GBA domain it happens to contain) - record the local offset into
    // that region where the domain actually begins.
    resolved[domain.name] = Object.freeze({
      regionId: match.id,
      domainOffsetInRegion: domain.start - match.start,
      start: domain.start,
      length: domain.length,
    });
  }
  return Object.freeze(resolved);
}

// Fetches one bounded snapshot per verified region via `readRangeFn`
// (regionId, offset, length) => Promise<Buffer>) - the caller supplies
// this, typically backed by the real LibretroProviderClient's `readRange`
// IPC operation (capped at 1 MiB per call by the provider itself; EWRAM's
// 256 KiB and IWRAM's 32 KiB both fit in a single call each). Both fetches
// run concurrently since they are independent reads of already-published
// memory - there is no ordering dependency between them.
export async function fetchEmeraldMemorySnapshot(readRangeFn, verifiedRegions) {
  if (typeof readRangeFn !== "function") throw new TypeError("readRangeFn must be a function");
  const [ewram, iwram] = await Promise.all([
    readRangeFn(verifiedRegions.EWRAM.regionId, verifiedRegions.EWRAM.domainOffsetInRegion, verifiedRegions.EWRAM.length),
    readRangeFn(verifiedRegions.IWRAM.regionId, verifiedRegions.IWRAM.domainOffsetInRegion, verifiedRegions.IWRAM.length),
  ]);
  if (!Buffer.isBuffer(ewram) || ewram.length !== verifiedRegions.EWRAM.length) {
    throw new LibretroEmeraldMemoryMapError(`EWRAM snapshot fetch returned ${ewram?.length ?? "no"} bytes, expected ${verifiedRegions.EWRAM.length}`);
  }
  if (!Buffer.isBuffer(iwram) || iwram.length !== verifiedRegions.IWRAM.length) {
    throw new LibretroEmeraldMemoryMapError(`IWRAM snapshot fetch returned ${iwram?.length ?? "no"} bytes, expected ${verifiedRegions.IWRAM.length}`);
  }
  return Object.freeze({ ewram, iwram });
}

function bufferForAddress(snapshot, address, width) {
  if (address >= GBA_EWRAM.start && address + width <= GBA_EWRAM.start + GBA_EWRAM.length) {
    return { buffer: snapshot.ewram, offset: address - GBA_EWRAM.start };
  }
  if (address >= GBA_IWRAM.start && address + width <= GBA_IWRAM.start + GBA_IWRAM.length) {
    return { buffer: snapshot.iwram, offset: address - GBA_IWRAM.start };
  }
  throw new RangeError(`GBA address 0x${address.toString(16)} (width ${width}) is outside verified EWRAM/IWRAM`);
}

// Builds the synchronous {read8, read16, read32} reader
// `readEmeraldAcquisition` requires, backed entirely by the already-fetched
// snapshot buffers - no further IPC occurs once this is called. Values are
// little-endian, matching the real GBA (ARM7TDMI, little-endian) and every
// other existing reader in this project.
export function createSnapshotReader(snapshot) {
  return Object.freeze({
    read8(address) {
      const { buffer, offset } = bufferForAddress(snapshot, address, 1);
      return buffer.readUInt8(offset);
    },
    read16(address) {
      const { buffer, offset } = bufferForAddress(snapshot, address, 2);
      return buffer.readUInt16LE(offset);
    },
    read32(address) {
      const { buffer, offset } = bufferForAddress(snapshot, address, 4);
      return buffer.readUInt32LE(offset);
    },
  });
}
