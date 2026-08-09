import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  LibretroEmeraldMemoryMapError,
  createSnapshotReader,
  fetchEmeraldMemorySnapshot,
  resolveVerifiedRegions,
} from "../adapters/libretro-emerald/reader.js";
import { readEmeraldAcquisition } from "../adapters/pokemon-emerald-us-rev0/emerald-us-rev0.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureUrl = new URL("../adapters/pokemon-emerald-us-rev0/fixtures/emerald-us-rev0-derived.json", import.meta.url);

// A realistic discovered-region list, matching the real official mGBA
// core's actual published SET_MEMORY_MAPS shape (region IDs, base
// addresses, and lengths observed during manual real-core validation),
// with a few unrelated regions (BIOS, ROM mirrors, VRAM) present too - so
// tests prove region *selection* works, not just that the only two
// regions present happen to be right.
function realisticMemoryRegions(overrides = {}) {
  const base = [
    { id: "region-0", addrspace: null, start: 0x03000000, length: 0x8000, offset: 0, select: 0, disconnect: 0, accessible: true }, // IWRAM
    { id: "region-1", addrspace: null, start: 0x02000000, length: 0x40000, offset: 0, select: 0, disconnect: 0, accessible: true }, // EWRAM
    { id: "region-2", addrspace: null, start: 0x0e000000, length: 0x20000, offset: 0, select: 0, disconnect: 0, accessible: true }, // SRAM
    { id: "region-3", addrspace: null, start: 0x08000000, length: 0x1000000, offset: 0, select: 0, disconnect: 0, accessible: true }, // ROM
    { id: "region-6", addrspace: null, start: 0, length: 0x4000, offset: 0, select: 0, disconnect: 0, accessible: true }, // BIOS
  ];
  return base.map((region) => (overrides[region.id] ? { ...region, ...overrides[region.id] } : region));
}

test("resolveVerifiedRegions selects the correct region for EWRAM and IWRAM among unrelated regions", () => {
  const resolved = resolveVerifiedRegions(realisticMemoryRegions());
  assert.equal(resolved.EWRAM.regionId, "region-1");
  assert.equal(resolved.EWRAM.domainOffsetInRegion, 0);
  assert.equal(resolved.EWRAM.length, 0x40000);
  assert.equal(resolved.IWRAM.regionId, "region-0");
  assert.equal(resolved.IWRAM.domainOffsetInRegion, 0);
  assert.equal(resolved.IWRAM.length, 0x8000);
});

test("resolveVerifiedRegions fails closed when EWRAM is missing (missing memory-map capability)", () => {
  const regions = realisticMemoryRegions().filter((r) => r.id !== "region-1");
  assert.throws(() => resolveVerifiedRegions(regions), LibretroEmeraldMemoryMapError);
  assert.throws(() => resolveVerifiedRegions(regions), /EWRAM/);
});

test("resolveVerifiedRegions fails closed when IWRAM is missing", () => {
  const regions = realisticMemoryRegions().filter((r) => r.id !== "region-0");
  assert.throws(() => resolveVerifiedRegions(regions), /IWRAM/);
});

test("resolveVerifiedRegions fails closed when a matching region is inaccessible", () => {
  const regions = realisticMemoryRegions({ "region-1": { accessible: false } });
  assert.throws(() => resolveVerifiedRegions(regions), /not accessible/);
});

test("resolveVerifiedRegions fails closed when a matching region is too small", () => {
  const regions = realisticMemoryRegions({ "region-1": { length: 0x100 } }); // far smaller than EWRAM's real 0x40000
  assert.throws(() => resolveVerifiedRegions(regions), /EWRAM/);
});

test("resolveVerifiedRegions fails closed on a missing/malformed memoryRegions value", () => {
  assert.throws(() => resolveVerifiedRegions(undefined), LibretroEmeraldMemoryMapError);
  assert.throws(() => resolveVerifiedRegions(null), LibretroEmeraldMemoryMapError);
  assert.throws(() => resolveVerifiedRegions("not-an-array"), LibretroEmeraldMemoryMapError);
});

test("fetchEmeraldMemorySnapshot issues exactly one bounded readRange call per verified region, at the correct offset/length", async () => {
  const resolved = resolveVerifiedRegions(realisticMemoryRegions());
  const calls = [];
  const readRangeFn = async (regionId, offset, length) => {
    calls.push({ regionId, offset, length });
    return Buffer.alloc(length, regionId === resolved.EWRAM.regionId ? 0xaa : 0xbb);
  };
  const snapshot = await fetchEmeraldMemorySnapshot(readRangeFn, resolved);
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((c) => [c.regionId, c.offset, c.length]).sort(),
    [
      [resolved.EWRAM.regionId, 0, 0x40000],
      [resolved.IWRAM.regionId, 0, 0x8000],
    ].sort(),
  );
  assert.equal(snapshot.ewram.length, 0x40000);
  assert.equal(snapshot.iwram.length, 0x8000);
  assert.equal(snapshot.ewram[0], 0xaa);
  assert.equal(snapshot.iwram[0], 0xbb);
});

test("fetchEmeraldMemorySnapshot fails closed when a fetch returns the wrong number of bytes", async () => {
  const resolved = resolveVerifiedRegions(realisticMemoryRegions());
  const shortEwram = async () => Buffer.alloc(10); // far short of 0x40000
  await assert.rejects(() => fetchEmeraldMemorySnapshot(shortEwram, resolved), LibretroEmeraldMemoryMapError);
});

test("fetchEmeraldMemorySnapshot rejects a non-function readRangeFn", async () => {
  const resolved = resolveVerifiedRegions(realisticMemoryRegions());
  await assert.rejects(() => fetchEmeraldMemorySnapshot("not-a-function", resolved), TypeError);
});

test("createSnapshotReader: u8/u16/u32 are little-endian and correctly offset per region", () => {
  const ewram = Buffer.alloc(0x40000);
  const iwram = Buffer.alloc(0x8000);
  ewram.set([0x11, 0x22, 0x33, 0x44], 0x100); // relative to EWRAM start
  iwram.set([0xaa, 0xbb, 0xcc, 0xdd], 0x50); // relative to IWRAM start

  const reader = createSnapshotReader({ ewram, iwram });
  assert.equal(reader.read8(0x02000100), 0x11);
  assert.equal(reader.read16(0x02000100), 0x2211);
  assert.equal(reader.read32(0x02000100), 0x44332211);
  assert.equal(reader.read8(0x03000050), 0xaa);
  assert.equal(reader.read16(0x03000050), 0xbbaa);
  assert.equal(reader.read32(0x03000050), 0xddccbbaa);
});

test("createSnapshotReader fails closed for an address outside verified EWRAM/IWRAM (out-of-range/inaccessible memory)", () => {
  const ewram = Buffer.alloc(0x40000);
  const iwram = Buffer.alloc(0x8000);
  const reader = createSnapshotReader({ ewram, iwram });
  assert.throws(() => reader.read8(0x08000000), RangeError); // ROM
  assert.throws(() => reader.read16(0x06000000), RangeError); // VRAM
  assert.throws(() => reader.read32(0x02040000), RangeError); // one byte past EWRAM's real end
  assert.throws(() => reader.read8(0x03007fff + 1), RangeError); // one byte past IWRAM's real end (0x03008000)
});

test("createSnapshotReader satisfies readEmeraldAcquisition's requireReader contract", () => {
  const reader = createSnapshotReader({ ewram: Buffer.alloc(0x40000), iwram: Buffer.alloc(0x8000) });
  assert.equal(typeof reader.read8, "function");
  assert.equal(typeof reader.read16, "function");
  assert.equal(typeof reader.read32, "function");
});

// The central "reuse, don't duplicate" proof: build EWRAM/IWRAM buffers
// entirely from the existing, already-reviewed Emerald fixture (used
// elsewhere by test/mgba-emerald-acquisition.test.js and
// test/emerald-provider-parity.test.js), decode through the real
// createSnapshotReader() + the unmodified readEmeraldAcquisition(), and
// assert byte-for-byte equality against that fixture's own expected
// output - proving this adapter's reader is a faithful, lossless stand-in
// for any other provider's reader, not a reimplementation.
test("createSnapshotReader + readEmeraldAcquisition exactly reproduce the canonical Emerald fixture's expected output", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const ewram = Buffer.alloc(0x40000);
  const iwram = Buffer.alloc(0x8000);

  function apply(map, write) {
    for (const [key, value] of Object.entries(map)) {
      const address = Number.parseInt(key, 16);
      if (address >= 0x02000000 && address < 0x02000000 + 0x40000) write(ewram, address - 0x02000000, value);
      else if (address >= 0x03000000 && address < 0x03000000 + 0x8000) write(iwram, address - 0x03000000, value);
      else assert.fail(`fixture address ${key} is outside EWRAM/IWRAM - test fixture or region math is wrong`);
    }
  }
  apply(fixture.memory.read8, (buf, offset, value) => buf.writeUInt8(value, offset));
  apply(fixture.memory.read16, (buf, offset, value) => buf.writeUInt16LE(value, offset));
  apply(fixture.memory.read32, (buf, offset, value) => buf.writeUInt32LE(value, offset));

  const reader = createSnapshotReader({ ewram, iwram });
  const acquisition = readEmeraldAcquisition(reader);
  const plain = JSON.parse(JSON.stringify(acquisition));

  assert.deepEqual(plain.party, fixture.expected.party);
  assert.deepEqual(plain.battle, fixture.expected.battle);
  assert.deepEqual(plain.location, fixture.expected.location);
  assert.deepEqual(plain.badges, fixture.expected.badges);
  assert.deepEqual(plain.bag, fixture.expected.bag);
});

test("reader.js contains no Emerald memory addresses (only the generic GBA EWRAM/IWRAM domain constants)", async () => {
  const source = await readFile(resolve(root, "adapters/libretro-emerald/reader.js"), "utf8");
  // The only hex literals allowed are the generic GBA EWRAM/IWRAM base
  // addresses and sizes (0x02000000/0x40000, 0x03000000/0x8000) - any
  // other 0x02xxxxxx/0x03xxxxxx-shaped literal would indicate a leaked
  // Emerald-specific field address, which belongs exclusively to
  // adapters/pokemon-emerald-us-rev0/emerald-us-rev0.js.
  const hexLiterals = source.match(/0x[0-9a-fA-F]+/g) ?? [];
  const allowed = new Set(["0x02000000", "0x40000", "0x03000000", "0x8000"]);
  const unexpected = hexLiterals.filter((literal) => !allowed.has(literal));
  assert.deepEqual(unexpected, [], "reader.js must contain no Emerald-specific memory addresses");
});
