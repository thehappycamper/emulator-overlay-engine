import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EMERALD_SOURCE_CONTRACT,
  MGBA_SOURCE,
  createEmeraldSourceSnapshot,
} from "../adapters/pokemon-emerald-us-rev0/emerald-source-contract.js";
import {
  EMERALD_US_REV0,
  readEmeraldAcquisition,
} from "../adapters/pokemon-emerald-us-rev0/emerald-us-rev0.js";
import {
  EmeraldSourceSnapshotValidationError,
  assertValidEmeraldSourceSnapshot,
  readValidatedEmeraldSourceSnapshot,
} from "../adapters/pokemon-emerald-us-rev0/validate-source-snapshot.js";
import { writeEmeraldSourceSnapshot } from "../adapters/pokemon-emerald-us-rev0/write-source-snapshot.js";

const derivedFixtureUrl = new URL(
  "../adapters/pokemon-emerald-us-rev0/fixtures/emerald-us-rev0-derived.json",
  import.meta.url,
);
const sourceFixtureUrl = new URL(
  "../adapters/pokemon-emerald-us-rev0/fixtures/emerald-us-rev0.source.json",
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

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

test("public-safe Emerald source fixture validates against the named contract", async () => {
  const snapshot = await readJson(sourceFixtureUrl);
  assert.equal(assertValidEmeraldSourceSnapshot(snapshot), true);
  assert.deepEqual(snapshot.contract, {
    id: EMERALD_SOURCE_CONTRACT.id,
    version: EMERALD_SOURCE_CONTRACT.version,
  });
});

test("malformed and missing source fields fail deterministically", async () => {
  const missingContract = await readJson(sourceFixtureUrl);
  delete missingContract.contract;
  assert.throws(
    () => assertValidEmeraldSourceSnapshot(missingContract),
    (error) =>
      error instanceof EmeraldSourceSnapshotValidationError &&
      error.errors.some(
        (entry) => entry.keyword === "required" && entry.params.missingProperty === "contract",
      ),
  );

  const malformed = await readJson(sourceFixtureUrl);
  malformed.party.first.currentHp = "31";
  assert.throws(
    () => assertValidEmeraldSourceSnapshot(malformed),
    /Invalid pokemon\.emerald\.us-rev0\.acquisition@1\.0\.0 source snapshot/,
  );
});

test("contract version and source invariants reject incompatible snapshots", async () => {
  const wrongVersion = await readJson(sourceFixtureUrl);
  wrongVersion.contract.version = "2.0.0";
  assert.throws(() => assertValidEmeraldSourceSnapshot(wrongVersion));

  const inconsistentParty = await readJson(sourceFixtureUrl);
  inconsistentParty.party.count = 0;
  assert.throws(() => assertValidEmeraldSourceSnapshot(inconsistentParty));

  const inconsistentBattle = await readJson(sourceFixtureUrl);
  inconsistentBattle.battle.active = false;
  assert.throws(() => assertValidEmeraldSourceSnapshot(inconsistentBattle));
});

test("empty party, inactive battle, and unreadable location remain valid source states", async () => {
  const snapshot = createEmeraldSourceSnapshot(MGBA_SOURCE, EMERALD_US_REV0.identity, {
    party: { count: 0, first: null },
    battle: { active: false, typeFlags: 0, trainerBattle: false, opponent: null },
    location: null,
  });
  assert.equal(assertValidEmeraldSourceSnapshot(snapshot), true);
});

test("tested mGBA reader output builds the canonical source snapshot", async () => {
  const derived = await readJson(derivedFixtureUrl);
  const expected = await readJson(sourceFixtureUrl);
  const snapshot = readValidatedEmeraldSourceSnapshot(
    MGBA_SOURCE,
    derived.identity,
    createReader(derived.memory),
  );

  assert.deepEqual(snapshot, expected);
  assert.equal(assertValidEmeraldSourceSnapshot(snapshot), true);
  assert.equal(Object.isFrozen(snapshot), true);
});

test("unsupported ROM identity cannot produce a source snapshot", async () => {
  const derived = await readJson(derivedFixtureUrl);
  const acquisition = readEmeraldAcquisition(createReader(derived.memory));
  assert.throws(
    () => createEmeraldSourceSnapshot(MGBA_SOURCE, { ...derived.identity, revision: 1 }, acquisition),
    /Unsupported Emerald ROM/,
  );
});

test("atomic writer keeps the previous complete snapshot visible until replacement", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "emerald-source-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, "snapshot.json");
  const first = await readJson(sourceFixtureUrl);
  const second = structuredClone(first);
  second.party.first.currentHp = 20;

  await writeEmeraldSourceSnapshot(destination, first);

  let releaseRename;
  let renameStarted;
  const renameStartedPromise = new Promise((resolve) => {
    renameStarted = resolve;
  });
  const releaseRenamePromise = new Promise((resolve) => {
    releaseRename = resolve;
  });
  const fileSystem = {
    open,
    mkdir,
    rm,
    rename: async (source, target) => {
      renameStarted();
      await releaseRenamePromise;
      return rename(source, target);
    },
  };

  const pendingWrite = writeEmeraldSourceSnapshot(destination, second, { fileSystem });
  await renameStartedPromise;
  assert.deepEqual(JSON.parse(await readFile(destination, "utf8")), first);
  assert.equal((await readdir(directory)).some((name) => name.endsWith(".tmp")), true);

  releaseRename();
  await pendingWrite;
  assert.deepEqual(JSON.parse(await readFile(destination, "utf8")), second);
  assert.equal((await readdir(directory)).some((name) => name.endsWith(".tmp")), false);
});

test("invalid snapshots never replace an existing valid handoff", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "emerald-source-invalid-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, "snapshot.json");
  const valid = await readJson(sourceFixtureUrl);
  await writeEmeraldSourceSnapshot(destination, valid);

  const invalid = structuredClone(valid);
  delete invalid.game.crc32;
  await assert.rejects(() => writeEmeraldSourceSnapshot(destination, invalid));
  assert.deepEqual(JSON.parse(await readFile(destination, "utf8")), valid);
});

test("shared Lua contract and mGBA provider pin ownership and atomic handoff", async () => {
  const sharedLua = await readFile(
    new URL("../adapters/pokemon-emerald-us-rev0/emerald-acquisition.lua", import.meta.url),
    "utf8",
  );
  const providerLua = await readFile(
    new URL("../adapters/gen3-mgba/emerald-acquisition.lua", import.meta.url),
    "utf8",
  );
  assert.match(sharedLua, new RegExp(EMERALD_SOURCE_CONTRACT.id.replaceAll(".", "\\.")));
  assert.match(sharedLua, new RegExp(EMERALD_SOURCE_CONTRACT.version.replaceAll(".", "\\.")));
  assert.doesNotMatch(providerLua, /0x020244E9|GROWTH_SUBSTRUCT_INDEX/u);
  assert.match(providerLua, /EMERALD_ACQUISITION_MODULE_PATH/);
  const lua = providerLua;
  assert.match(lua, /EMERALD_SOURCE_SNAPSHOT_PATH/);
  assert.match(lua, /snapshotPath \.\. "\.tmp"/);
  assert.match(lua, /io\.open\(temporaryPath, "wb"\)/);
  assert.match(lua, /file:flush\(\)/);
  assert.match(lua, /os\.rename\(temporaryPath, snapshotPath\)/);
  assert.match(lua, /clearSourceSnapshot\(\)/);
});
