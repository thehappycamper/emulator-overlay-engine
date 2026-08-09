import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  UnsupportedLibretroCoreError,
  acquireEmeraldSourceSnapshot,
  assertSupportedLibretroCore,
  runOnceEmeraldLibretroAcquisition,
} from "../adapters/libretro-emerald/acquire.js";
import { assertValidEmeraldSourceSnapshot } from "../adapters/pokemon-emerald-us-rev0/validate-source-snapshot.js";

const fixtureUrl = new URL("../adapters/pokemon-emerald-us-rev0/fixtures/emerald-us-rev0-derived.json", import.meta.url);

const realisticMemoryRegions = Object.freeze([
  { id: "region-0", start: 0x03000000, length: 0x8000, accessible: true },
  { id: "region-1", start: 0x02000000, length: 0x40000, accessible: true },
]);

async function fixtureBuffers() {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const ewram = Buffer.alloc(0x40000);
  const iwram = Buffer.alloc(0x8000);
  function apply(map, write) {
    for (const [key, value] of Object.entries(map)) {
      const address = Number.parseInt(key, 16);
      if (address >= 0x02000000 && address < 0x02000000 + 0x40000) write(ewram, address - 0x02000000, value);
      else write(iwram, address - 0x03000000, value);
    }
  }
  apply(fixture.memory.read8, (buf, offset, value) => buf.writeUInt8(value, offset));
  apply(fixture.memory.read16, (buf, offset, value) => buf.writeUInt16LE(value, offset));
  apply(fixture.memory.read32, (buf, offset, value) => buf.writeUInt32LE(value, offset));
  return { ewram, iwram, identity: fixture.identity, expected: fixture.expected };
}

// A fake provider client matching LibretroProviderClient's `request(op,
// params)` shape, backed by real fixture-derived EWRAM/IWRAM memory - so
// reads exercise the real base64/region-offset plumbing, not a stub.
function createFakeClient({ ewram, iwram, core, memoryRegions = realisticMemoryRegions, initializeShouldFail = false } = {}) {
  const client = {
    shutdownCalled: 0,
    async request(op, params) {
      if (op === "initialize") {
        if (initializeShouldFail) throw new Error("simulated provider initialize failure");
        return {
          protocolVersion: "1.0.0",
          core: core ?? { name: "mGBA", version: "0.11-test", validExtensions: "gba|gb|gbc|sgb" },
          content: { size: ewram?.length ?? 0 },
          capabilities: ["memory.regions", "memory.read8", "memory.read16", "memory.read32", "memory.readRange", "frame.execute"],
          memoryRegions,
        };
      }
      if (op === "run") return { framesExecuted: params.frames };
      if (op === "readRange") {
        const region = memoryRegions.find((r) => r.id === params.regionId);
        const source = region?.start === 0x02000000 ? ewram : iwram;
        const bytes = source.subarray(params.offset, params.offset + params.length);
        return { bytes: Buffer.from(bytes).toString("base64"), length: params.length };
      }
      if (op === "shutdown") {
        client.shutdownCalled += 1;
        return { unloaded: true, deinitialized: true, callbacksUnregistered: 6 };
      }
      throw new Error(`unexpected op ${op}`);
    },
    async shutdown() {
      return client.request("shutdown");
    },
  };
  return client;
}

test("assertSupportedLibretroCore accepts the official mGBA core and rejects an unrelated core (unsupported core identity)", () => {
  assert.equal(assertSupportedLibretroCore({ name: "mGBA", validExtensions: "gba|gb|gbc|sgb" }), true);
  assert.throws(
    () => assertSupportedLibretroCore({ name: "Snes9x", validExtensions: "sfc|smc" }),
    UnsupportedLibretroCoreError,
  );
});

test("assertSupportedLibretroCore rejects an mGBA-named core that does not declare GBA content support", () => {
  assert.throws(
    () => assertSupportedLibretroCore({ name: "mGBA", validExtensions: "gb|gbc" }),
    /GBA content support/,
  );
});

test("acquireEmeraldSourceSnapshot validates its own required arguments", async () => {
  await assert.rejects(() => acquireEmeraldSourceSnapshot({}), TypeError);
  await assert.rejects(() => acquireEmeraldSourceSnapshot({ client: {} }), TypeError);
  await assert.rejects(
    () => acquireEmeraldSourceSnapshot({ client: { request: async () => ({}) }, corePath: "", contentPath: "x" }),
    TypeError,
  );
});

test("acquireEmeraldSourceSnapshot fails closed on an unsupported ROM identity before ever contacting the provider (unsupported content identity)", async () => {
  const { ewram, iwram } = await fixtureBuffers();
  const client = createFakeClient({ ewram, iwram });
  let initializeCalled = false;
  const trackedClient = {
    ...client,
    request: (op, params) => {
      if (op === "initialize") initializeCalled = true;
      return client.request(op, params);
    },
  };
  await assert.rejects(
    () =>
      acquireEmeraldSourceSnapshot({
        client: trackedClient,
        corePath: "C:\\fake\\core.dll",
        contentPath: "C:\\fake\\rom.gba",
        identityFn: async () => ({ gameCode: "AGB-BPEE", title: "POKEMON EMER", revision: 0, crc32: "DEADBEEF" }),
      }),
    RangeError,
  );
  assert.equal(initializeCalled, false, "the provider must never be asked to initialize when the ROM identity is wrong");
});

test("acquireEmeraldSourceSnapshot fails closed on an unsupported Libretro core after identity passes but before any memory read", async () => {
  const { ewram, iwram, identity } = await fixtureBuffers();
  const client = createFakeClient({ ewram, iwram, core: { name: "Snes9x", validExtensions: "sfc" } });
  let readRangeCalled = false;
  const trackedClient = {
    ...client,
    request: (op, params) => {
      if (op === "readRange") readRangeCalled = true;
      return client.request(op, params);
    },
  };
  await assert.rejects(
    () =>
      acquireEmeraldSourceSnapshot({
        client: trackedClient,
        corePath: "C:\\fake\\core.dll",
        contentPath: "C:\\fake\\rom.gba",
        identityFn: async () => identity,
      }),
    UnsupportedLibretroCoreError,
  );
  assert.equal(readRangeCalled, false, "no memory read must occur when the core itself is unsupported");
});

test("acquireEmeraldSourceSnapshot fails closed when the provider's memory map is missing a verified region (missing memory-map capability)", async () => {
  const { ewram, iwram, identity } = await fixtureBuffers();
  const client = createFakeClient({ ewram, iwram, memoryRegions: [realisticMemoryRegions[0]] }); // IWRAM only, EWRAM missing
  await assert.rejects(
    () =>
      acquireEmeraldSourceSnapshot({
        client,
        corePath: "C:\\fake\\core.dll",
        contentPath: "C:\\fake\\rom.gba",
        identityFn: async () => identity,
      }),
    /EWRAM/,
  );
});

test("acquireEmeraldSourceSnapshot succeeds end to end (real region resolution, real snapshot fetch, real reader, real acquisition) and produces a schema-valid snapshot with LIBRETRO_SOURCE provenance", async () => {
  const { ewram, iwram, identity, expected } = await fixtureBuffers();
  const client = createFakeClient({ ewram, iwram });
  const snapshot = await acquireEmeraldSourceSnapshot({
    client,
    corePath: "C:\\fake\\core.dll",
    contentPath: "C:\\fake\\rom.gba",
    identityFn: async () => identity,
  });

  assert.equal(assertValidEmeraldSourceSnapshot(snapshot), true);
  assert.equal(snapshot.source.provider.id, "libretro");
  assert.equal(snapshot.source.integration, "libretro-ipc");
  assert.deepEqual([...snapshot.source.memory.verifiedDomains], ["EWRAM", "IWRAM"]);
  assert.deepEqual(snapshot.game, { gameCode: "AGB-BPEE", title: "POKEMON EMER", revision: 0, crc32: "1F1C08FB" });
  assert.deepEqual(snapshot.party, expected.party);
  assert.deepEqual(snapshot.battle, expected.battle);
  assert.deepEqual(snapshot.location, expected.location);
  assert.deepEqual(snapshot.badges, expected.badges);
  assert.deepEqual(snapshot.bag, expected.bag);
});

test("acquireEmeraldSourceSnapshot runs bootstrapFrames extra frames before reading memory when requested", async () => {
  const { ewram, iwram, identity } = await fixtureBuffers();
  const client = createFakeClient({ ewram, iwram });
  const calls = [];
  const trackedClient = {
    ...client,
    request: (op, params) => {
      calls.push(op);
      return client.request(op, params);
    },
  };
  await acquireEmeraldSourceSnapshot({
    client: trackedClient,
    corePath: "C:\\fake\\core.dll",
    contentPath: "C:\\fake\\rom.gba",
    identityFn: async () => identity,
    bootstrapFrames: 5,
  });
  assert.deepEqual(calls, ["initialize", "run", "readRange", "readRange"]);
});

test("runOnceEmeraldLibretroAcquisition shuts the provider down exactly once on success", async () => {
  const { ewram, iwram, identity } = await fixtureBuffers();
  const client = createFakeClient({ ewram, iwram });
  await runOnceEmeraldLibretroAcquisition({
    client,
    corePath: "C:\\fake\\core.dll",
    contentPath: "C:\\fake\\rom.gba",
    identityFn: async () => identity,
  });
  assert.equal(client.shutdownCalled, 1);
});

test("runOnceEmeraldLibretroAcquisition shuts the provider down exactly once when identity fails (before initialize)", async () => {
  const { ewram, iwram } = await fixtureBuffers();
  const client = createFakeClient({ ewram, iwram });
  await assert.rejects(() =>
    runOnceEmeraldLibretroAcquisition({
      client,
      corePath: "C:\\fake\\core.dll",
      contentPath: "C:\\fake\\rom.gba",
      identityFn: async () => ({ gameCode: "AGB-BPEE", title: "POKEMON EMER", revision: 0, crc32: "DEADBEEF" }),
    }),
  );
  assert.equal(client.shutdownCalled, 1);
});

test("runOnceEmeraldLibretroAcquisition shuts the provider down exactly once when the core is unsupported (after initialize)", async () => {
  const { ewram, iwram, identity } = await fixtureBuffers();
  const client = createFakeClient({ ewram, iwram, core: { name: "Snes9x", validExtensions: "sfc" } });
  await assert.rejects(() =>
    runOnceEmeraldLibretroAcquisition({
      client,
      corePath: "C:\\fake\\core.dll",
      contentPath: "C:\\fake\\rom.gba",
      identityFn: async () => identity,
    }),
  );
  assert.equal(client.shutdownCalled, 1);
});

test("runOnceEmeraldLibretroAcquisition shuts the provider down exactly once even when initialize() itself throws", async () => {
  const { ewram, iwram, identity } = await fixtureBuffers();
  const client = createFakeClient({ ewram, iwram, initializeShouldFail: true });
  await assert.rejects(() =>
    runOnceEmeraldLibretroAcquisition({
      client,
      corePath: "C:\\fake\\core.dll",
      contentPath: "C:\\fake\\rom.gba",
      identityFn: async () => identity,
    }),
  );
  assert.equal(client.shutdownCalled, 1);
});

test("runOnceEmeraldLibretroAcquisition never throws from cleanup itself if client.shutdown is missing", async () => {
  const { ewram, iwram, identity } = await fixtureBuffers();
  const client = createFakeClient({ ewram, iwram });
  delete client.shutdown;
  const snapshot = await runOnceEmeraldLibretroAcquisition({
    client,
    corePath: "C:\\fake\\core.dll",
    contentPath: "C:\\fake\\rom.gba",
    identityFn: async () => identity,
  });
  assert.equal(snapshot.source.provider.id, "libretro");
});
