import assert from "node:assert/strict";
import test from "node:test";

// This file needs koffi, which is intentionally installed only under this
// experiment's own package.json/node_modules (see README.md), not at the
// repository root. Root's default `node --test` recursively discovers
// *every* `*.test.js` file in the repo, including this one, regardless of
// where its own `npm run test` script is invoked from - so if koffi cannot
// be resolved (a genuinely fresh clone that has run root `npm ci` but never
// `npm ci` inside this experiment directory), this file must degrade to a
// single, clearly-labeled skipped test instead of throwing at import time
// and taking down the entire root test run. `address-translate.test.js` in
// this same directory has no such dependency and is safe to import
// unconditionally; this file is not, and needs this guard because of it.
let koffi = null;
let decodeMemoryMap = null;
try {
  ({ default: koffi } = await import("koffi"));
  ({ decodeMemoryMap } = await import("../libretro-abi.mjs"));
} catch {
  // koffi is not installed in this environment; see the skipped test below.
}

if (!koffi) {
  test(
    "decodeMemoryMap koffi round-trip tests (skipped: koffi is not installed in this environment - run `npm ci` inside experiments/libretro-direct-host to enable)",
    { skip: true },
    () => {},
  );
} else {
  // Round-trips a synthetic retro_memory_map/retro_memory_descriptor pair
  // through real koffi struct encoding, exercising decodeMemoryMap() exactly
  // as it runs against a live core's SET_MEMORY_MAPS payload - but without
  // loading any native library or registering any callback, so this stays
  // safe to run standalone (no dynamic core, no FFI callback lifecycle).
  //
  // This directly regression-tests a real bug found during independent
  // review: decodeMemoryMap() decoded every retro_memory_descriptor field
  // except `offset`, silently dropping it. Since libretro.h documents offset
  // as required for correct address translation ("it is recommended to use
  // this field for address calculations instead of performing arithmetic on
  // ptr"), a dropped offset would have produced wrong buffer reads for any
  // descriptor with a non-zero offset (real cores use this for regions that
  // share a backing pointer, e.g. mirrored ROM banks) while looking correct
  // for the zero-offset case this spike's original ad hoc smoke test
  // happened to exercise.
  const RetroMemoryDescriptorScratch = koffi.struct("retro_memory_descriptor_test", {
    flags: "uint64_t",
    ptr: "void *",
    offset: "size_t",
    start: "size_t",
    select: "size_t",
    disconnect: "size_t",
    len: "size_t",
    addrspace: "const char *",
  });

  const RetroMemoryMapScratch = koffi.struct("retro_memory_map_test", {
    descriptors: koffi.pointer(RetroMemoryDescriptorScratch),
    num_descriptors: "unsigned int",
  });

  // Single-descriptor helper: allocates one retro_memory_descriptor, encodes
  // `values` into it, wraps it in a one-entry retro_memory_map, and returns
  // the map pointer decodeMemoryMap() expects.
  const encodeSingleDescriptorMap = (values) => {
    const backing = Buffer.alloc(16);
    const descriptorBuf = koffi.alloc(RetroMemoryDescriptorScratch, 1);
    koffi.encode(descriptorBuf, RetroMemoryDescriptorScratch, { flags: 0n, ptr: backing, addrspace: null, ...values });

    const mapBuf = koffi.alloc(RetroMemoryMapScratch, 1);
    koffi.encode(mapBuf, RetroMemoryMapScratch, { descriptors: descriptorBuf, num_descriptors: 1 });
    return mapBuf;
  };

  test("decodeMemoryMap preserves descriptor.offset through the real koffi decode path", () => {
    const mapBuf = encodeSingleDescriptorMap({
      offset: 0x1234,
      start: 0x02000000,
      select: 0xff000000,
      disconnect: 0,
      len: 0x40000,
      addrspace: "EWRAM",
    });

    const [descriptor] = decodeMemoryMap(mapBuf);
    assert.equal(descriptor.offset, 0x1234);
    assert.equal(descriptor.start, 0x02000000);
    assert.equal(descriptor.select, 0xff000000);
    assert.equal(descriptor.len, 0x40000);
    assert.equal(descriptor.addrspace, "EWRAM");
  });

  test("decodeMemoryMap preserves a zero offset as 0, not as missing/undefined", () => {
    const mapBuf = encodeSingleDescriptorMap({
      offset: 0,
      start: 0x03000000,
      select: 0xff000000,
      disconnect: 0,
      len: 0x8000,
      addrspace: "IWRAM",
    });

    const [descriptor] = decodeMemoryMap(mapBuf);
    assert.equal(descriptor.offset, 0);
    assert.notEqual(descriptor.offset, undefined);
  });

  test("decodeMemoryMap returns an empty array for zero descriptors without touching the descriptors pointer", () => {
    const mapBuf = koffi.alloc(RetroMemoryMapScratch, 1);
    koffi.encode(mapBuf, RetroMemoryMapScratch, { descriptors: null, num_descriptors: 0 });
    assert.deepEqual(decodeMemoryMap(mapBuf), []);
  });
}
