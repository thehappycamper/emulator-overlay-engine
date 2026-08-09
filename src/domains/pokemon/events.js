// Pokemon-domain semantic event detectors (ADR 0013 / P03-T001). This is
// where Pokemon-specific interpretation of normalized state transitions
// lives; src/events/derive.js (the shared, domain-neutral primitive this
// module builds on) has no idea any of these event types, or Pokemon
// itself, exist.
//
// Every detector here is a pure function `(previousState, currentState) =>
// partialEvent[]`, reading only the canonical `pokemon.overlay-state`
// shape (src/domains/pokemon/schemas/overlay-state.schema.json) - never
// raw emulator memory, and never anything BizHawk/mGBA/Libretro-specific.
//
// ## Party-slot identity - read this before trusting `subject.slot`
//
// The canonical schema has a `pid` field per Pokemon (intended to be a
// strong, effectively-unique per-individual identity - e.g. a decoded
// personality value). As of this task, the only real acquisition pipeline
// (adapters/pokemon-emerald-us-rev0) does not populate it: `pid` is always
// absent from real Emerald-derived state today, even though the schema
// allows it. `pokemonIdentityKey()` below therefore falls back to a
// heuristic key (species + nickname) whenever `pid` is missing - which is
// the strongest signal actually available today, but is NOT a guaranteed-
// unique identity: two distinct individual Pokemon of the same species
// sharing the same nickname (e.g. two un-nicknamed "WURMPLE") are
// indistinguishable by this key. Ambiguous fallback keys are deliberately
// non-comparable: per-Pokemon HP/status/faint transitions are suppressed
// rather than risk attributing one individual's change to another. An
// evolution (species change) breaks a unique fallback match entirely, read
// as "old individual left, new individual arrived" rather than "the same
// individual changed species." `party[0]` is never treated as a permanent
// identity by itself. If a provider ever populates `pid`, matching upgrades
// to that strong identity automatically, with no detector code changes
// required.

import { deriveEvents } from "../../events/derive.js";

// Resolves the strongest available identity key for one Pokemon. Prefers
// `pid` (a real per-individual identity) when a provider populates it;
// otherwise falls back to a species+nickname heuristic - see the module
// comment above for this fallback's real, disclosed limitations.
export function pokemonIdentityKey(pokemon) {
  if (!pokemon) return null;
  if (typeof pokemon.pid === "string" && pokemon.pid.length > 0) {
    return `pid:${pokemon.pid}`;
  }
  return `heuristic:${pokemon.speciesId ?? "?"}:${pokemon.nickname ?? ""}`;
}

// Matches two party arrays by identity, not by array index, so a simple
// reorder (the same individuals in a different slot order) is recognized
// as the same individuals - not read as everyone being removed and
// different Pokemon being added. Ambiguous fallback matches are retained
// for party-delta reporting, but marked `ambiguous` and excluded from all
// per-Pokemon transition comparisons. This avoids FIFO pairing from
// fabricating damage/healing/status changes when identity cannot be proven.
export function matchPartyMembers(previousParty = [], currentParty = []) {
  const previousBuckets = new Map();
  const previousCounts = new Map();
  const currentCounts = new Map();
  previousParty.forEach((pokemon, index) => {
    const key = pokemonIdentityKey(pokemon);
    previousCounts.set(key, (previousCounts.get(key) ?? 0) + 1);
    if (!previousBuckets.has(key)) previousBuckets.set(key, []);
    previousBuckets.get(key).push({ pokemon, index });
  });
  currentParty.forEach((pokemon) => {
    const key = pokemonIdentityKey(pokemon);
    currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
  });
  const ambiguousFallbackKeys = new Set();
  for (const [key, count] of previousCounts) {
    if (key.startsWith("heuristic:") && (count > 1 || (currentCounts.get(key) ?? 0) > 1)) {
      ambiguousFallbackKeys.add(key);
    }
  }
  for (const [key, count] of currentCounts) {
    if (key.startsWith("heuristic:") && (count > 1 || (previousCounts.get(key) ?? 0) > 1)) {
      ambiguousFallbackKeys.add(key);
    }
  }

  const matched = [];
  const added = [];

  currentParty.forEach((pokemon, currentIndex) => {
    const key = pokemonIdentityKey(pokemon);
    const bucket = previousBuckets.get(key);
    if (bucket && bucket.length > 0) {
      const { pokemon: previousPokemon, index: previousIndex } = bucket.shift();
      matched.push({
        key,
        ambiguous: ambiguousFallbackKeys.has(key),
        previous: previousPokemon,
        current: pokemon,
        previousIndex,
        currentIndex,
      });
    } else {
      added.push({ key, current: pokemon, currentIndex });
    }
  });

  const removed = [];
  for (const [key, bucket] of previousBuckets) {
    for (const { pokemon, index } of bucket) {
      removed.push({ key, ambiguous: ambiguousFallbackKeys.has(key), previous: pokemon, previousIndex: index });
    }
  }

  return Object.freeze({ matched: Object.freeze(matched), added: Object.freeze(added), removed: Object.freeze(removed) });
}

function summarizePokemonRef(pokemon) {
  if (!pokemon) return null;
  return Object.freeze({
    speciesId: pokemon.speciesId ?? null,
    name: pokemon.name ?? null,
    nickname: pokemon.nickname ?? null,
  });
}

// Every currently-trackable (previous, current) Pokemon pair this snapshot
// transition can meaningfully compare: matched party members (by identity,
// not slot), plus the battle opponent only when the opponent present in
// both snapshots is - by the same identity key - plausibly the same
// individual. Without that check, a trainer's Pokemon fainting and being
// replaced by their next Pokemon (opponent still present in both
// snapshots, but a different individual) would otherwise look like one
// opponent's HP discontinuously jumping back up - a fabricated "heal" that
// never happened. When the identity key differs, this pair is simply
// omitted; per-Pokemon detectors correctly emit nothing for it rather than
// inventing a comparison across two different individuals.
function collectTrackedPokemonPairs(previousState, currentState) {
  const pairs = [];
  const previousParty = previousState.player?.party ?? [];
  const currentParty = currentState.player?.party ?? [];
  const { matched } = matchPartyMembers(previousParty, currentParty);
  for (const { previous, current, currentIndex, ambiguous } of matched) {
    if (ambiguous) continue;
    pairs.push({ subjectKind: "party", slot: currentIndex, previous, current });
  }

  const previousOpponent = previousState.battle?.opponent ?? null;
  const currentOpponent = currentState.battle?.opponent ?? null;
  if (
    previousOpponent &&
    currentOpponent &&
    pokemonIdentityKey(previousOpponent) === pokemonIdentityKey(currentOpponent)
  ) {
    pairs.push({ subjectKind: "opponent", slot: null, previous: previousOpponent, current: currentOpponent });
  }
  return pairs;
}

function subjectFor(pair) {
  return Object.freeze({
    kind: pair.subjectKind,
    slot: pair.slot,
    speciesId: pair.current.speciesId ?? null,
    name: pair.current.name ?? null,
    nickname: pair.current.nickname ?? null,
  });
}

function hasComparableHp(pokemon) {
  return Number.isFinite(pokemon?.currentHp);
}

function detectHpChanged(previousState, currentState) {
  const events = [];
  for (const pair of collectTrackedPokemonPairs(previousState, currentState)) {
    const { previous, current } = pair;
    if (!hasComparableHp(previous) || !hasComparableHp(current)) continue;
    if (previous.currentHp === current.currentHp) continue;
    events.push({
      type: "pokemon.hp.changed",
      subject: subjectFor(pair),
      previous: { currentHp: previous.currentHp, maxHp: previous.maxHp ?? null },
      current: { currentHp: current.currentHp, maxHp: current.maxHp ?? null },
    });
  }
  return events;
}

function detectDamaged(previousState, currentState) {
  const events = [];
  for (const pair of collectTrackedPokemonPairs(previousState, currentState)) {
    const { previous, current } = pair;
    if (!hasComparableHp(previous) || !hasComparableHp(current)) continue;
    if (current.currentHp >= previous.currentHp) continue;
    events.push({
      type: "pokemon.damaged",
      subject: subjectFor(pair),
      previous: { currentHp: previous.currentHp },
      current: { currentHp: current.currentHp, amount: previous.currentHp - current.currentHp },
    });
  }
  return events;
}

function detectHealed(previousState, currentState) {
  const events = [];
  for (const pair of collectTrackedPokemonPairs(previousState, currentState)) {
    const { previous, current } = pair;
    if (!hasComparableHp(previous) || !hasComparableHp(current)) continue;
    if (current.currentHp <= previous.currentHp) continue;
    events.push({
      type: "pokemon.healed",
      subject: subjectFor(pair),
      previous: { currentHp: previous.currentHp },
      current: { currentHp: current.currentHp, amount: current.currentHp - previous.currentHp },
    });
  }
  return events;
}

// Fires exactly on the 0-crossing transition (previous > 0, current === 0),
// never on a 0 -> 0 pair - deduplication falls straight out of comparing
// only the two snapshots actually passed in, with no separate "have I
// already fired this" bookkeeping needed.
function detectFainted(previousState, currentState) {
  const events = [];
  for (const pair of collectTrackedPokemonPairs(previousState, currentState)) {
    const { previous, current } = pair;
    if (!hasComparableHp(previous) || !hasComparableHp(current)) continue;
    if (!(previous.currentHp > 0 && current.currentHp === 0)) continue;
    events.push({
      type: "pokemon.fainted",
      subject: subjectFor(pair),
      previous: { currentHp: previous.currentHp },
      current: { currentHp: 0 },
    });
  }
  return events;
}

function normalizeStatus(pokemon) {
  return pokemon?.status ?? "none";
}

function detectStatusChanged(previousState, currentState) {
  const events = [];
  for (const pair of collectTrackedPokemonPairs(previousState, currentState)) {
    const previousStatus = normalizeStatus(pair.previous);
    const currentStatus = normalizeStatus(pair.current);
    if (previousStatus === currentStatus) continue;
    events.push({
      type: "pokemon.status.changed",
      subject: subjectFor(pair),
      previous: { status: previousStatus },
      current: { status: currentStatus },
    });
  }
  return events;
}

// Fires on membership or ordering changes (added/removed/reordered), not
// on a per-member stat change - that is already covered by the detectors
// above. A pure HP/status/level change with the same members in the same
// slots does not trigger this event.
function detectPartyChanged(previousState, currentState) {
  const previousParty = previousState.player?.party ?? [];
  const currentParty = currentState.player?.party ?? [];
  const { matched, added, removed } = matchPartyMembers(previousParty, currentParty);
  const reordered = matched.filter((entry) => entry.previousIndex !== entry.currentIndex);

  if (added.length === 0 && removed.length === 0 && reordered.length === 0) {
    return [];
  }

  return [
    {
      type: "party.changed",
      subject: { kind: "party" },
      previous: null,
      current: {
        added: added.map((entry) => ({ slot: entry.currentIndex, ...summarizePokemonRef(entry.current) })),
        removed: removed.map((entry) => ({ previousSlot: entry.previousIndex, ...summarizePokemonRef(entry.previous) })),
        reordered: reordered.map((entry) => ({
          previousSlot: entry.previousIndex,
          currentSlot: entry.currentIndex,
          ...summarizePokemonRef(entry.current),
        })),
      },
    },
  ];
}

function detectBattleStarted(previousState, currentState) {
  const previousOpponent = previousState.battle?.opponent ?? null;
  const currentOpponent = currentState.battle?.opponent ?? null;
  if (previousOpponent || !currentOpponent) return [];
  return [
    {
      type: "battle.started",
      subject: { kind: "battle" },
      previous: null,
      current: { opponent: summarizePokemonRef(currentOpponent) },
    },
  ];
}

function detectBattleEnded(previousState, currentState) {
  const previousOpponent = previousState.battle?.opponent ?? null;
  const currentOpponent = currentState.battle?.opponent ?? null;
  if (!previousOpponent || currentOpponent) return [];
  return [
    {
      type: "battle.ended",
      subject: { kind: "battle" },
      previous: { opponent: summarizePokemonRef(previousOpponent) },
      current: null,
    },
  ];
}

// Fires on any location.name string change, including a transition to/from
// the acquisition layer's own disclosed "Unknown location" fallback text
// (see adapters/pokemon-emerald-us-rev0's mapping) - that fallback is a
// real string value in normalized state like any other, and this detector
// does not special-case it. A consumer that wants to filter transitions
// to/from that specific placeholder can do so itself; baking that
// presentation-layer convention into this detector would be exactly the
// kind of magic-string coupling this domain module should not have.
function detectLocationChanged(previousState, currentState) {
  const previousName = previousState.location?.name;
  const currentName = currentState.location?.name;
  if (typeof previousName !== "string" || typeof currentName !== "string") return [];
  if (previousName === currentName) return [];
  return [
    {
      type: "location.changed",
      subject: { kind: "location" },
      previous: { name: previousName },
      current: { name: currentName },
    },
  ];
}

function detectBadgeEarned(previousState, currentState) {
  const previousBadges = previousState.player?.badges;
  const currentBadges = currentState.player?.badges;
  if (!Array.isArray(previousBadges) || !Array.isArray(currentBadges)) return [];

  const events = [];
  const length = Math.min(previousBadges.length, currentBadges.length);
  for (let index = 0; index < length; index += 1) {
    if (!previousBadges[index] && currentBadges[index]) {
      events.push({
        type: "badge.earned",
        subject: { kind: "badge", index },
        previous: { earned: false },
        current: { earned: true },
      });
    }
  }
  return events;
}

export const POKEMON_EVENT_DETECTORS = Object.freeze([
  detectBattleStarted,
  detectBattleEnded,
  detectHpChanged,
  detectDamaged,
  detectHealed,
  detectFainted,
  detectStatusChanged,
  detectPartyChanged,
  detectLocationChanged,
  detectBadgeEarned,
]);

// The Pokemon domain's event-detection entry point: runs every detector
// above through the shared, domain-neutral deriveEvents() primitive.
// `options.stampEvent` should be a single `createEventSequencer()` result
// reused across every call in one session, so `sequence` stays monotonic
// for the whole event stream rather than resetting per snapshot pair.
export function detectPokemonEvents(previousState, currentState, options = {}) {
  const game = currentState?.game ?? previousState?.game ?? null;
  return deriveEvents(previousState, currentState, POKEMON_EVENT_DETECTORS, {
    ...options,
    provenance: { domain: "pokemon", game, ...(options.provenance ?? {}) },
  });
}
