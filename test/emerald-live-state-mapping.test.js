import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertValidEmeraldStateMappingProject,
  assertValidPokemonState,
  loadEmeraldStateMappingProject,
  mapEmeraldSourceFile,
  mapEmeraldSourceSnapshot,
  writePokemonLiveState,
} from "../adapters/gen3-mgba/emerald-state-mapping.js";
import { renderPokemonOverlay } from "../src/domains/pokemon/index.js";

const sourceFixtureUrl = new URL(
  "../adapters/gen3-mgba/fixtures/emerald-us-rev0.source.json",
  import.meta.url,
);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("Emerald mapping project satisfies the mapping schema and contract descriptors", () => {
  const project = loadEmeraldStateMappingProject();
  assert.equal(assertValidEmeraldStateMappingProject(project), true);
  assert.deepEqual(project.source, {
    id: "pokemon.emerald.us-rev0.mgba.acquisition",
    type: "acquisition-source-snapshot",
    version: "1.0.0",
    schema: "urn:source-contract:pokemon.emerald.us-rev0.mgba.acquisition:1.0.0",
    description: "Strict-fingerprint live values acquired from Pokemon Emerald US Rev 0 through mGBA.",
  });
  assert.equal(project.target.id, "pokemon.overlay-state");
  assert.equal(project.target.version, "0.1.0");
});

test("live Emerald fields map into a valid Pokemon normalized state", async () => {
  const source = await readJson(sourceFixtureUrl);
  const state = mapEmeraldSourceSnapshot(source);
  const acquisition = state.extensions["pokemon.emerald.us-rev0.mgba.acquisition"];

  assert.equal(assertValidPokemonState(state), true);
  assert.deepEqual(state.game, {
    generation: 3,
    title: "POKEMON EMER",
    adapter: "mGBA Emerald US Rev 0",
    romId: "AGB-BPEE",
  });
  assert.deepEqual(
    {
      speciesId: state.player.party[0].speciesId,
      level: state.player.party[0].level,
      currentHp: state.player.party[0].currentHp,
      maxHp: state.player.party[0].maxHp,
    },
    source.party.first,
  );
  assert.deepEqual(
    {
      speciesId: state.battle.opponent.speciesId,
      level: state.battle.opponent.level,
      currentHp: state.battle.opponent.currentHp,
      maxHp: state.battle.opponent.maxHp,
    },
    source.battle.opponent,
  );
  assert.deepEqual(acquisition.location, source.location);
  assert.equal(acquisition.battleActive, true);
  assert.equal(acquisition.battleTypeFlags, source.battle.typeFlags);
});

test("literal placeholders are visible, schema-valid, and renderer-safe", async () => {
  const state = mapEmeraldSourceSnapshot(await readJson(sourceFixtureUrl));
  const partyPokemon = state.player.party[0];
  const opponent = state.battle.opponent;

  assert.equal(partyPokemon.name, "Species name unavailable");
  assert.deepEqual(partyPokemon.types, ["unknown"]);
  assert.deepEqual(partyPokemon.moves, []);
  assert.deepEqual(partyPokemon.stats, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  assert.equal(opponent.name, "Species name unavailable");
  assert.equal(state.location.name, "Location name unavailable");
  assert.deepEqual(state.bag, { balls: [], tms: [] });

  const html = renderPokemonOverlay(state);
  assert.match(html, /POKEMON EMER/);
  assert.match(html, /Species name unavailable/);
  assert.match(html, /HP 31\/35/);
  assert.match(html, /Location name unavailable/);
});

test("fixed source slots collapse safely when party or battle entries are absent", async () => {
  const source = await readJson(sourceFixtureUrl);
  source.party = { count: 0, first: null };
  source.battle = { active: false, typeFlags: 0, opponent: null };
  source.location = null;

  const state = mapEmeraldSourceSnapshot(source);
  assert.deepEqual(state.player.party, []);
  assert.equal(state.battle.opponent, undefined);
  assert.equal(state.location.name, "Location name unavailable");
  assert.equal(state.extensions["pokemon.emerald.us-rev0.mgba.acquisition"].location, undefined);
  assert.doesNotThrow(() => renderPokemonOverlay(state));
});

test("Ajv target validation fails closed on source values invalid for Pokemon state", async () => {
  const source = await readJson(sourceFixtureUrl);
  source.party.first.level = 0;

  assert.throws(
    () => mapEmeraldSourceSnapshot(source),
    (error) =>
      error.name === "ContractValidationError" &&
      /Pokemon normalized state failed validation/.test(error.message),
  );
});

test("atomic live-state writer exposes the prior complete state until rename", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "emerald-live-state-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, "live-state.json");
  const first = mapEmeraldSourceSnapshot(await readJson(sourceFixtureUrl));
  const second = structuredClone(first);
  second.player.party[0].currentHp = 20;

  await writePokemonLiveState(destination, first);

  let releaseRename;
  let renameStarted;
  const renameStartedPromise = new Promise((resolve) => {
    renameStarted = resolve;
  });
  const releaseRenamePromise = new Promise((resolve) => {
    releaseRename = resolve;
  });
  const fileSystem = {
    mkdir,
    open,
    rm,
    rename: async (source, target) => {
      renameStarted();
      await releaseRenamePromise;
      return rename(source, target);
    },
  };

  const pendingWrite = writePokemonLiveState(destination, second, { fileSystem });
  await renameStartedPromise;
  assert.deepEqual(await readJson(destination), first);
  assert.equal((await readdir(directory)).some((name) => name.endsWith(".tmp")), true);

  releaseRename();
  await pendingWrite;
  assert.deepEqual(await readJson(destination), second);
  assert.equal((await readdir(directory)).some((name) => name.endsWith(".tmp")), false);
});

test("file orchestration preserves the last valid live state when mapping fails", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "emerald-pipeline-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourcePath = join(directory, "source.json");
  const targetPath = join(directory, "live-state.json");
  const source = await readJson(sourceFixtureUrl);
  await writeFile(sourcePath, JSON.stringify(source), "utf8");

  const first = await mapEmeraldSourceFile({ sourcePath, targetPath });
  assert.deepEqual(await readJson(targetPath), first);

  source.party.first.maxHp = 0;
  await writeFile(sourcePath, JSON.stringify(source), "utf8");
  await assert.rejects(
    () => mapEmeraldSourceFile({ sourcePath, targetPath }),
    /Pokemon normalized state failed validation/,
  );
  assert.deepEqual(await readJson(targetPath), first);
});
