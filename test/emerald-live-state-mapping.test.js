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
} from "../adapters/pokemon-emerald-us-rev0/emerald-state-mapping.js";
import { renderPokemonOverlay } from "../src/domains/pokemon/index.js";

const sourceFixtureUrl = new URL(
  "../adapters/pokemon-emerald-us-rev0/fixtures/emerald-us-rev0.source.json",
  import.meta.url,
);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("Emerald mapping project satisfies the mapping schema and contract descriptors", () => {
  const project = loadEmeraldStateMappingProject();
  assert.equal(assertValidEmeraldStateMappingProject(project), true);
  assert.deepEqual(project.source, {
    id: "pokemon.emerald.us-rev0.acquisition",
    type: "acquisition-source-snapshot",
    version: "1.0.0",
    schema: "urn:source-contract:pokemon.emerald.us-rev0.acquisition:1.0.0",
    description: "Enriched (species/type/move/item/location names already resolved) live values acquired from Pokemon Emerald US Rev 0 through a supported provider.",
  });
  assert.equal(project.target.id, "pokemon.overlay-state");
  assert.equal(project.target.version, "0.1.0");
});

test("live Emerald fields map every genuinely-present party slot (not just one) into a valid Pokemon normalized state", async () => {
  const source = await readJson(sourceFixtureUrl);
  const state = mapEmeraldSourceSnapshot(source);
  const acquisition = state.extensions["pokemon.emerald.us-rev0.acquisition"];

  assert.equal(assertValidPokemonState(state), true);
  assert.deepEqual(state.game, {
    generation: 3,
    title: "POKEMON EMER",
    adapter: "mGBA",
    romId: "AGB-BPEE",
  });

  assert.equal(state.player.party.length, source.party.slots.length);
  for (let index = 0; index < source.party.slots.length; index += 1) {
    const expected = source.party.slots[index];
    const actual = state.player.party[index];
    assert.equal(actual.speciesId, expected.speciesId);
    assert.equal(actual.name, expected.name);
    assert.equal(actual.nickname, expected.nickname);
    assert.deepEqual(actual.types, expected.types);
    assert.equal(actual.gender, expected.gender);
    assert.equal(actual.status, expected.status);
    assert.equal(actual.item, expected.item);
    assert.equal(actual.exp, expected.exp);
    assert.deepEqual(actual.expProgress, expected.expProgress);
    assert.deepEqual(actual.stats, expected.stats);
    assert.deepEqual(actual.ivs, expected.ivs);
    assert.deepEqual(actual.moves, expected.moves);
  }

  assert.equal(state.battle.opponent.speciesId, source.battle.opponent.speciesId);
  assert.deepEqual(state.battle.opponent.moves, source.battle.opponent.moves);
  assert.deepEqual(state.battle.opponent.statStages, source.battle.opponent.statStages);
  assert.deepEqual(state.battle.player, source.battle.player);
  assert.deepEqual(state.player.badges, source.badges);
  assert.equal(state.location.name, source.location.name);
  assert.deepEqual(acquisition.location, { mapGroup: source.location.mapGroup, mapNumber: source.location.mapNumber, x: source.location.x, y: source.location.y });
  assert.equal(acquisition.battleActive, true);
  assert.equal(acquisition.battleTypeFlags, source.battle.typeFlags);
});

test("resolved species/move/item/location names render as real values, not placeholder strings", async () => {
  const state = mapEmeraldSourceSnapshot(await readJson(sourceFixtureUrl));
  const partyPokemon = state.player.party[0];
  const opponent = state.battle.opponent;

  assert.equal(partyPokemon.name, "TORCHIC");
  assert.deepEqual(partyPokemon.types, ["Fire"]);
  assert.equal(partyPokemon.moves.length, 2);
  assert.equal(partyPokemon.moves[0].name, "TACKLE");
  assert.equal(opponent.name, "CHARIZARD");
  assert.equal(state.location.name, "Route 101");
  assert.deepEqual(state.bag, { balls: [
    { id: 4, name: "Poke Ball", quantity: 8, catchChance: 0.07095453202060753 },
    { id: 3, name: "Great Ball", quantity: 3, catchChance: 0.10660922591856825 },
    { id: 2, name: "Ultra Ball", quantity: 1, catchChance: 0.1434003102418715 },
  ] });

  const html = renderPokemonOverlay(state);
  assert.match(html, /POKEMON EMER/);
  assert.match(html, /TORCHIC/);
  assert.match(html, /31\/35/);
  assert.match(html, /Route 101/);
  assert.doesNotMatch(html, /Species name unavailable/);
});

test("fixed source slots collapse safely (empty party, no battle, unreadable location/badges)", async () => {
  const source = await readJson(sourceFixtureUrl);
  source.party = { count: 0, slots: [], first: null };
  source.battle = { active: false, typeFlags: 0, trainerBattle: false, opponent: null, player: { statStages: null } };
  source.location = null;
  source.badges = null;
  source.bag = null;

  const state = mapEmeraldSourceSnapshot(source);
  assert.deepEqual(state.player.party, []);
  assert.equal(state.battle.opponent, undefined);
  // Genuinely unavailable location is a disclosed, literal fallback string
  // ("Unknown location"), never a fabricated real place name.
  assert.equal(state.location.name, "Unknown location");
  assert.equal(state.player.badges, null);
  assert.equal(state.extensions["pokemon.emerald.us-rev0.acquisition"].location, undefined);
  assert.doesNotThrow(() => renderPokemonOverlay(state));
});

test("a fainted party member (currentHp: 0) and an asleep status map through and render without throwing", async () => {
  const source = await readJson(sourceFixtureUrl);
  const state = mapEmeraldSourceSnapshot(source);
  const fainted = state.player.party[1];
  assert.equal(fainted.currentHp, 0);
  assert.equal(fainted.status, "asleep");

  const html = renderPokemonOverlay(state);
  assert.match(html, /class="card team-card fainted"/);
  assert.match(html, /Asleep/);
});

test("Ajv target validation fails closed on source values invalid for Pokemon state", async () => {
  const source = await readJson(sourceFixtureUrl);
  source.party.slots[0].level = 0;
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

  source.party.slots[0].maxHp = 0;
  source.party.first.maxHp = 0;
  await writeFile(sourcePath, JSON.stringify(source), "utf8");
  await assert.rejects(
    () => mapEmeraldSourceFile({ sourcePath, targetPath }),
    /Pokemon normalized state failed validation/,
  );
  assert.deepEqual(await readJson(targetPath), first);
});
