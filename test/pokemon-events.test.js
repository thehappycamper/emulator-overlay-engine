import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { detectPokemonEvents, matchPartyMembers, pokemonIdentityKey } from "../src/domains/pokemon/events.js";
import { createEventSequencer } from "../src/events/derive.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function pokemon(overrides = {}) {
  return {
    speciesId: 1,
    name: "BULBASAUR",
    nickname: "BUD",
    level: 10,
    currentHp: 30,
    maxHp: 30,
    status: "none",
    ...overrides,
  };
}

function state({ party = [pokemon()], opponent = null, badges = null, location = "Route 101", game = { title: "POKEMON EMER", adapter: "mGBA" } } = {}) {
  return {
    game,
    player: { party, badges },
    battle: { opponent },
    location: { name: location },
  };
}

function typesOf(events) {
  return events.map((e) => e.type);
}

test("event derivation is provider-neutral by construction: no BizHawk/mGBA/Libretro import coupling in source", () => {
  // Checks for actual coupling (import paths reaching into an
  // emulator-specific adapter or experiment), not mere mentions of these
  // names - the source files' own comments legitimately explain that no
  // such coupling exists, which would false-positive on a plain word match.
  const files = ["src/events/derive.js", "src/events/validate.js", "src/domains/pokemon/events.js"];
  const forbiddenImportPattern = /from\s+["'][^"']*(adapters\/bizhawk|adapters\/gen3-mgba|experiments\/libretro)[^"']*["']/i;
  for (const file of files) {
    const text = readFileSync(resolve(repositoryRoot, file), "utf8");
    assert.doesNotMatch(text, forbiddenImportPattern, `${file} must not import from a BizHawk/mGBA/Libretro-specific path`);
  }
});

test("a first-ever snapshot (no previous state) emits nothing, even already mid-battle with a full party", () => {
  const current = state({
    party: [pokemon({ currentHp: 15 })],
    opponent: pokemon({ speciesId: 6, nickname: "OPP" }),
    badges: [true, false, false, false, false, false, false, false],
  });
  assert.deepEqual(detectPokemonEvents(null, current), []);
  assert.deepEqual(detectPokemonEvents(undefined, current), []);
});

test("feeding the identical state twice emits nothing, regardless of which provider produced it", () => {
  const snapshot = state({
    party: [pokemon(), pokemon({ speciesId: 25, nickname: "SPARKY", name: "PIKACHU" })],
    opponent: pokemon({ speciesId: 6, nickname: "OPP" }),
    badges: [true, false, false, false, false, false, false, false],
  });
  // structuredClone so this is genuinely two distinct objects with the
  // same content, not the same reference - proves value comparison, not
  // reference comparison.
  const clone = structuredClone(snapshot);
  assert.deepEqual(detectPokemonEvents(snapshot, clone), []);
});

test("HP decrease emits hp.changed and damaged but not healed or fainted", () => {
  const previous = state({ party: [pokemon({ currentHp: 30 })] });
  const current = state({ party: [pokemon({ currentHp: 18 })] });
  const events = detectPokemonEvents(previous, current);
  assert.deepEqual(typesOf(events), ["pokemon.hp.changed", "pokemon.damaged"]);
  const damaged = events.find((e) => e.type === "pokemon.damaged");
  assert.equal(damaged.current.amount, 12);
  assert.equal(damaged.subject.kind, "party");
  assert.equal(damaged.subject.slot, 0);
});

test("HP increase emits hp.changed and healed but not damaged or fainted", () => {
  const previous = state({ party: [pokemon({ currentHp: 10 })] });
  const current = state({ party: [pokemon({ currentHp: 30 })] });
  const events = detectPokemonEvents(previous, current);
  assert.deepEqual(typesOf(events), ["pokemon.hp.changed", "pokemon.healed"]);
  assert.equal(events.find((e) => e.type === "pokemon.healed").current.amount, 20);
});

test("fainted fires exactly once on the 4->0 transition and never again on subsequent 0->0 snapshots", () => {
  const stampEvent = createEventSequencer({ now: () => "2026-08-09T00:00:00.000Z" });
  const snapshots = [
    state({ party: [pokemon({ currentHp: 4 })] }),
    state({ party: [pokemon({ currentHp: 4 })] }), // unchanged
    state({ party: [pokemon({ currentHp: 0 })] }), // faints here
    state({ party: [pokemon({ currentHp: 0 })] }), // still fainted
    state({ party: [pokemon({ currentHp: 0 })] }), // still fainted
  ];

  const allEvents = [];
  for (let i = 1; i < snapshots.length; i += 1) {
    allEvents.push(...detectPokemonEvents(snapshots[i - 1], snapshots[i], { stampEvent }));
  }

  const faintedEvents = allEvents.filter((e) => e.type === "pokemon.fainted");
  assert.equal(faintedEvents.length, 1);
  assert.equal(faintedEvents[0].previous.currentHp, 4);
  assert.equal(faintedEvents[0].current.currentHp, 0);
});

test("a battling Pokemon fainting, taking damage, and changing status all in one snapshot fires all applicable events simultaneously", () => {
  const previous = state({
    party: [pokemon({ currentHp: 6, status: "none" })],
    opponent: pokemon({ speciesId: 6, nickname: "OPP", currentHp: 20, maxHp: 20 }),
  });
  const current = state({
    party: [pokemon({ currentHp: 0, status: "asleep" })],
    opponent: pokemon({ speciesId: 6, nickname: "OPP", currentHp: 12, maxHp: 20 }),
  });
  const events = detectPokemonEvents(previous, current);

  const partyEventTypes = events.filter((e) => e.subject?.kind === "party").map((e) => e.type);
  const opponentEventTypes = events.filter((e) => e.subject?.kind === "opponent").map((e) => e.type);
  assert.deepEqual(new Set(partyEventTypes), new Set(["pokemon.hp.changed", "pokemon.damaged", "pokemon.fainted", "pokemon.status.changed"]));
  assert.deepEqual(new Set(opponentEventTypes), new Set(["pokemon.hp.changed", "pokemon.damaged"]));
});

test("battle.started fires when an opponent newly appears; battle.ended fires when it disappears; neither fires without a real transition", () => {
  const noBattle = state({ opponent: null });
  const inBattle = state({ opponent: pokemon({ speciesId: 6, nickname: "OPP" }) });

  assert.deepEqual(typesOf(detectPokemonEvents(noBattle, inBattle)), ["battle.started"]);
  assert.deepEqual(typesOf(detectPokemonEvents(inBattle, noBattle)), ["battle.ended"]);
  assert.deepEqual(detectPokemonEvents(noBattle, noBattle), []);
  assert.deepEqual(
    detectPokemonEvents(inBattle, state({ opponent: pokemon({ speciesId: 6, nickname: "OPP" }) })),
    [],
  );
});

test("a trainer's next Pokemon replacing a fainted opponent mid-battle does not fabricate a heal/damage across two different individuals", () => {
  const previous = state({ opponent: pokemon({ speciesId: 1, nickname: "FIRST", currentHp: 0, maxHp: 20 }) });
  const current = state({ opponent: pokemon({ speciesId: 25, nickname: "SECOND", currentHp: 40, maxHp: 40 }) });
  const events = detectPokemonEvents(previous, current);
  // The battle is still active in both snapshots, so battle.started/ended
  // must not fire either - only the identity-mismatched HP pair is
  // correctly skipped.
  assert.deepEqual(events, []);
});

test("party reorder alone (same individuals, different slots) does not fire hp/fainted/status events and is reported as party.changed with a reordered entry", () => {
  const a = pokemon({ speciesId: 1, nickname: "A", currentHp: 20 });
  const b = pokemon({ speciesId: 25, nickname: "B", currentHp: 25 });
  const previous = state({ party: [a, b] });
  const current = state({ party: [b, a] }); // swapped

  const events = detectPokemonEvents(previous, current);
  assert.deepEqual(typesOf(events), ["party.changed"]);
  const change = events[0];
  assert.deepEqual(change.current.added, []);
  assert.deepEqual(change.current.removed, []);
  assert.equal(change.current.reordered.length, 2);
  assert.deepEqual(
    change.current.reordered.map((r) => [r.previousSlot, r.currentSlot, r.nickname]).sort(),
    [[0, 1, "A"], [1, 0, "B"]],
  );
});

test("party add/remove is reported as party.changed with added/removed, and matched members' own transitions still fire normally", () => {
  const stays = pokemon({ speciesId: 1, nickname: "STAYS", currentHp: 20 });
  const leaves = pokemon({ speciesId: 25, nickname: "LEAVES" });
  const arrives = pokemon({ speciesId: 6, nickname: "ARRIVES" });

  const previous = state({ party: [stays, leaves] });
  const current = state({ party: [{ ...stays, currentHp: 10 }, arrives] });

  const events = detectPokemonEvents(previous, current);
  const partyChanged = events.find((e) => e.type === "party.changed");
  assert.ok(partyChanged);
  assert.deepEqual(partyChanged.current.added.map((e) => e.nickname), ["ARRIVES"]);
  assert.deepEqual(partyChanged.current.removed.map((e) => e.nickname), ["LEAVES"]);
  assert.deepEqual(partyChanged.current.reordered, []);

  // The matched, still-present member's own HP change is still detected
  // correctly despite the membership change happening in the same snapshot.
  assert.ok(events.some((e) => e.type === "pokemon.damaged" && e.subject.nickname === "STAYS"));
});

test("no false party.changed fires when membership and order are both unchanged, even if stats changed", () => {
  const previous = state({ party: [pokemon({ currentHp: 30 }), pokemon({ speciesId: 25, nickname: "B" })] });
  const current = state({ party: [pokemon({ currentHp: 10 }), pokemon({ speciesId: 25, nickname: "B" })] });
  const events = detectPokemonEvents(previous, current);
  assert.ok(!events.some((e) => e.type === "party.changed"));
});

test("status.changed fires on any status transition, treating a missing status as \"none\"", () => {
  const previous = state({ party: [pokemon({ status: undefined })] });
  const current = state({ party: [pokemon({ status: "poisoned" })] });
  const events = detectPokemonEvents(previous, current);
  assert.deepEqual(typesOf(events), ["pokemon.status.changed"]);
  assert.deepEqual(events[0].previous, { status: "none" });
  assert.deepEqual(events[0].current, { status: "poisoned" });
});

test("location.changed fires on any name change, including transitions to/from a literal \"Unknown location\" fallback string", () => {
  const known = state({ location: "Route 101" });
  const unknown = state({ location: "Unknown location" });
  assert.deepEqual(typesOf(detectPokemonEvents(known, unknown)), ["location.changed"]);
  assert.deepEqual(typesOf(detectPokemonEvents(unknown, known)), ["location.changed"]);
  assert.deepEqual(detectPokemonEvents(known, known), []);
});

test("badge.earned fires once per newly-true badge index and never re-fires once already earned", () => {
  const stampEvent = createEventSequencer({ now: () => "2026-08-09T00:00:00.000Z" });
  const none = state({ badges: [false, false, false, false, false, false, false, false] });
  const two = state({ badges: [true, true, false, false, false, false, false, false] });
  const stillTwo = state({ badges: [true, true, false, false, false, false, false, false] });

  const firstBatch = detectPokemonEvents(none, two, { stampEvent });
  const secondBatch = detectPokemonEvents(two, stillTwo, { stampEvent });

  assert.deepEqual(
    firstBatch.filter((e) => e.type === "badge.earned").map((e) => e.subject.index),
    [0, 1],
  );
  assert.deepEqual(secondBatch, []);
});

test("badge.earned does not fire when badges are unavailable (null) on either side", () => {
  const unavailable = state({ badges: null });
  const available = state({ badges: [true, false, false, false, false, false, false, false] });
  assert.deepEqual(detectPokemonEvents(unavailable, available), []);
  assert.deepEqual(detectPokemonEvents(available, unavailable), []);
});

test("pokemonIdentityKey prefers a real pid over the species+nickname heuristic when a provider populates one", () => {
  const withPid = pokemon({ pid: "abc123" });
  assert.equal(pokemonIdentityKey(withPid), "pid:abc123");
  assert.equal(pokemonIdentityKey(pokemon({ pid: "" })), pokemonIdentityKey(pokemon()));
});

test("matchPartyMembers documents its real identity limitation: two individuals sharing species+nickname are matched best-effort by relative order, not guaranteed correctly", () => {
  const firstIndividual = pokemon({ speciesId: 290, nickname: "WURMPLE", currentHp: 5 });
  const secondIndividual = pokemon({ speciesId: 290, nickname: "WURMPLE", currentHp: 25 });
  const { matched, added, removed } = matchPartyMembers([firstIndividual, secondIndividual], [firstIndividual, secondIndividual]);
  assert.equal(matched.length, 2);
  assert.equal(added.length, 0);
  assert.equal(removed.length, 0);
  // Both share the identical fallback key - this is the disclosed
  // ambiguity, not a claim of guaranteed-correct individual tracking.
  assert.equal(matchPartyMembers([firstIndividual], [firstIndividual]).matched[0].key, matchPartyMembers([secondIndividual], [secondIndividual]).matched[0].key);
});

test("an evolution (species change) is read as the old individual leaving and a new one arriving, a disclosed limitation of the fallback identity key", () => {
  const beforeEvolution = pokemon({ speciesId: 1, nickname: "BUD", currentHp: 20 });
  const afterEvolution = pokemon({ speciesId: 2, nickname: "BUD", currentHp: 20 });
  const previous = state({ party: [beforeEvolution] });
  const current = state({ party: [afterEvolution] });
  const events = detectPokemonEvents(previous, current);
  const partyChanged = events.find((e) => e.type === "party.changed");
  assert.ok(partyChanged);
  assert.equal(partyChanged.current.added.length, 1);
  assert.equal(partyChanged.current.removed.length, 1);
});
