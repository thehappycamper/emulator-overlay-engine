import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BIZHAWK_SOURCE,
  LIBRETRO_SOURCE,
  MGBA_SOURCE,
} from "../adapters/pokemon-emerald-us-rev0/emerald-source-contract.js";
import { createSnapshotReader } from "../adapters/libretro-emerald/reader.js";
import {
  readValidatedEmeraldSourceSnapshot,
} from "../adapters/pokemon-emerald-us-rev0/validate-source-snapshot.js";
import {
  loadEmeraldStateMappingProject,
  mapEmeraldSourceSnapshot,
} from "../adapters/pokemon-emerald-us-rev0/emerald-state-mapping.js";
import {
  EMERALD_US_REV0 as canonicalEmerald,
  readEmeraldAcquisition as canonicalRead,
} from "../adapters/pokemon-emerald-us-rev0/emerald-us-rev0.js";
import {
  EMERALD_US_REV0 as compatibilityEmerald,
  readEmeraldAcquisition as compatibilityRead,
} from "../adapters/gen3-mgba/emerald-us-rev0.js";

const fixtureUrl = new URL(
  "../adapters/pokemon-emerald-us-rev0/fixtures/emerald-us-rev0-derived.json",
  import.meta.url,
);

function createReader(memory) {
  const read = (width, address) => {
    const key = `0x${address.toString(16).padStart(8, "0")}`;
    if (!(key in memory[width])) {
      throw new RangeError(`Fixture has no ${width} value at ${key}`);
    }
    return memory[width][key];
  };
  return {
    read8: (address) => read("read8", address),
    read16: (address) => read("read16", address),
    read32: (address) => read("read32", address),
  };
}

function withoutProviderProvenance(state) {
  const comparable = structuredClone(state);
  delete comparable.game.adapter;
  delete comparable.extensions["pokemon.emerald.us-rev0.acquisition"].source;
  return comparable;
}

// Builds a Libretro-backed reader from the same fixture, using the real,
// committed reader.js code (not a reimplementation) - the fixture only
// ever addresses bytes it explicitly provides, so a zero-elsewhere
// snapshot buffer (createSnapshotReader's real semantics against real
// Libretro IPC data) is equivalent to the other two providers' throws-on-
// missing sparse readers for this exact scenario.
function createLibretroReader(memory) {
  const ewram = Buffer.alloc(0x40000);
  const iwram = Buffer.alloc(0x8000);
  function apply(map, write) {
    for (const [key, value] of Object.entries(map)) {
      const address = Number.parseInt(key, 16);
      if (address >= 0x02000000 && address < 0x02000000 + 0x40000) write(ewram, address - 0x02000000, value);
      else write(iwram, address - 0x03000000, value);
    }
  }
  apply(memory.read8, (buf, offset, value) => buf.writeUInt8(value, offset));
  apply(memory.read16, (buf, offset, value) => buf.writeUInt16LE(value, offset));
  apply(memory.read32, (buf, offset, value) => buf.writeUInt32LE(value, offset));
  return createSnapshotReader({ ewram, iwram });
}

test("mGBA, BizHawk, and Libretro provenance wrap identical Emerald acquisition semantics", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const mgba = readValidatedEmeraldSourceSnapshot(MGBA_SOURCE, fixture.identity, createReader(fixture.memory));
  const bizhawk = readValidatedEmeraldSourceSnapshot(BIZHAWK_SOURCE, fixture.identity, createReader(fixture.memory));
  const libretro = readValidatedEmeraldSourceSnapshot(LIBRETRO_SOURCE, fixture.identity, createLibretroReader(fixture.memory));

  for (const [a, b] of [[mgba, bizhawk], [mgba, libretro], [bizhawk, libretro]]) {
    assert.deepEqual(a.party, b.party);
    assert.deepEqual(a.battle, b.battle);
    assert.deepEqual(a.location, b.location);
    assert.deepEqual(a.badges, b.badges);
    assert.deepEqual(a.bag, b.bag);
    assert.deepEqual(a.game, b.game);
  }
  assert.equal(mgba.source.provider.id, "mgba");
  assert.equal(bizhawk.source.provider.id, "bizhawk");
  assert.equal(libretro.source.provider.id, "libretro");
  assert.deepEqual(bizhawk.source.memory.verifiedDomains, ["EWRAM", "IWRAM"]);
  assert.deepEqual(libretro.source.memory.verifiedDomains, ["EWRAM", "IWRAM"]);
});

test("the existing mapping remains provider-independent across mGBA, BizHawk, and Libretro", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const mgba = readValidatedEmeraldSourceSnapshot(MGBA_SOURCE, fixture.identity, createReader(fixture.memory));
  const bizhawk = readValidatedEmeraldSourceSnapshot(BIZHAWK_SOURCE, fixture.identity, createReader(fixture.memory));
  const libretro = readValidatedEmeraldSourceSnapshot(LIBRETRO_SOURCE, fixture.identity, createLibretroReader(fixture.memory));

  const project = loadEmeraldStateMappingProject();
  assert.equal(project.source.id, "pokemon.emerald.us-rev0.acquisition");
  assert.doesNotMatch(JSON.stringify(project.source), /mgba|bizhawk|libretro/iu);

  const mgbaState = mapEmeraldSourceSnapshot(mgba);
  const bizhawkState = mapEmeraldSourceSnapshot(bizhawk);
  const libretroState = mapEmeraldSourceSnapshot(libretro);
  assert.equal(mgbaState.game.adapter, "mGBA");
  assert.equal(bizhawkState.game.adapter, "BizHawk");
  assert.equal(libretroState.game.adapter, "Libretro (mGBA core)");
  assert.deepEqual(withoutProviderProvenance(mgbaState), withoutProviderProvenance(bizhawkState));
  assert.deepEqual(withoutProviderProvenance(mgbaState), withoutProviderProvenance(libretroState));
});

test("mGBA compatibility imports preserve canonical game object and function identity", () => {
  assert.equal(compatibilityEmerald, canonicalEmerald);
  assert.equal(compatibilityRead, canonicalRead);
});
