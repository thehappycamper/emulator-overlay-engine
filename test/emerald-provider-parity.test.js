import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BIZHAWK_SOURCE,
  MGBA_SOURCE,
} from "../adapters/pokemon-emerald-us-rev0/emerald-source-contract.js";
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

test("mGBA and BizHawk provenance wrap identical Emerald acquisition semantics", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const reader = createReader(fixture.memory);
  const mgba = readValidatedEmeraldSourceSnapshot(MGBA_SOURCE, fixture.identity, reader);
  const bizhawk = readValidatedEmeraldSourceSnapshot(
    BIZHAWK_SOURCE,
    fixture.identity,
    createReader(fixture.memory),
  );

  assert.deepEqual(mgba.party, bizhawk.party);
  assert.deepEqual(mgba.battle, bizhawk.battle);
  // Explicit call-out: battle stat stages (player and opponent) are part of
  // the same battle object already asserted equal above, but are checked
  // by name too since they come from a separate gBattleMons read distinct
  // from the rest of battle/opponent acquisition.
  assert.deepEqual(mgba.battle.opponent.statStages, bizhawk.battle.opponent.statStages);
  assert.deepEqual(mgba.battle.player, bizhawk.battle.player);
  assert.deepEqual(mgba.location, bizhawk.location);
  assert.deepEqual(mgba.game, bizhawk.game);
  assert.equal(mgba.source.provider.id, "mgba");
  assert.equal(bizhawk.source.provider.id, "bizhawk");
  assert.deepEqual(bizhawk.source.memory.verifiedDomains, ["EWRAM", "IWRAM"]);
});

test("the existing mapping remains provider-independent", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const mgba = readValidatedEmeraldSourceSnapshot(
    MGBA_SOURCE,
    fixture.identity,
    createReader(fixture.memory),
  );
  const bizhawk = readValidatedEmeraldSourceSnapshot(
    BIZHAWK_SOURCE,
    fixture.identity,
    createReader(fixture.memory),
  );

  const project = loadEmeraldStateMappingProject();
  assert.equal(project.source.id, "pokemon.emerald.us-rev0.acquisition");
  assert.doesNotMatch(JSON.stringify(project.source), /mgba|bizhawk/iu);

  const mgbaState = mapEmeraldSourceSnapshot(mgba);
  const bizhawkState = mapEmeraldSourceSnapshot(bizhawk);
  assert.equal(mgbaState.game.adapter, "mGBA");
  assert.equal(bizhawkState.game.adapter, "BizHawk");
  assert.deepEqual(withoutProviderProvenance(mgbaState), withoutProviderProvenance(bizhawkState));
});

test("mGBA compatibility imports preserve canonical game object and function identity", () => {
  assert.equal(compatibilityEmerald, canonicalEmerald);
  assert.equal(compatibilityRead, canonicalRead);
});
