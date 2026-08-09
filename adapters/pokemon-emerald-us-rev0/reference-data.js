// Static Gen III / Emerald reference data (species names+types+growth rate,
// move names+type+category+power+accuracy+pp, item names, map group/number
// -> location name, and the Gen III text character map) plus the pure
// decode helpers that use them (nickname text, status condition, gender,
// EXP-to-level progress, move PP-with-bonus). All tables were generated
// from the real, MIT-licensed pret/pokeemerald decompilation source
// (https://github.com/pret/pokeemerald, master branch, fetched 2026-08),
// not typed from memory - see docs/tasks/P05/P05-T009.md's Implementation
// Notes for exactly which files each table came from and how each was
// independently verified.
//
// This module is game-owned (Pokemon Emerald US Rev 0 specific), not
// Pokemon-franchise-generic: internal species/move/item IDs and their
// mapping to display names are specific to this game and revision, so this
// belongs under the acquisition layer, not src/domains/pokemon.

import { readFileSync } from "node:fs";

function loadJson(name) {
  return JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), "utf8"));
}

export const SPECIES_TABLE = Object.freeze(loadJson("species.json"));
export const MOVES_TABLE = Object.freeze(loadJson("moves.json"));
export const ITEMS_TABLE = Object.freeze(loadJson("items.json"));
export const LOCATIONS_TABLE = Object.freeze(loadJson("locations.json"));
export const CHARMAP_TABLE = Object.freeze(loadJson("charmap.json"));
// Wild encounter table (P05-T011) and Poke Ball catch-multiplier reference
// (P05-T011) - see that task's Implementation Notes for exact source lines.
export const ENCOUNTERS_TABLE = Object.freeze(loadJson("encounters.json"));
export const BALLS_TABLE = Object.freeze(loadJson("balls.json"));

export function lookupSpecies(speciesId) {
  return SPECIES_TABLE[speciesId] ?? null;
}

export function lookupMove(moveId) {
  return MOVES_TABLE[moveId] ?? null;
}

export function lookupItem(itemId) {
  if (!itemId) return null;
  return ITEMS_TABLE[itemId] ?? null;
}

export function lookupLocation(mapGroup, mapNumber) {
  return LOCATIONS_TABLE[`${mapGroup}:${mapNumber}`] ?? null;
}

// Wild encounter slots for one map, or null if this map has no standard
// (grass/surf/rock-smash/fishing) wild encounter table - e.g. towns,
// buildings, and other maps with no wild Pokemon. Never fabricated: comes
// directly from pret/pokeemerald's own src/data/wild_encounters.json.
export function lookupEncounters(mapGroup, mapNumber) {
  return ENCOUNTERS_TABLE[`${mapGroup}:${mapNumber}`] ?? null;
}

export function lookupBallInfo(itemId) {
  return BALLS_TABLE[itemId] ?? null;
}

const STRING_TERMINATOR_BYTE = 0xff;

// Decodes a Gen III nickname (fixed-width, terminator-padded, Western
// charset) from raw bytes into readable text. Bytes at or after the first
// 0xFF terminator are not part of the name, matching the game's own
// string-reading convention (confirmed against pret/pokeemerald's
// charmap.txt, which is the actual table the ROM's text was compiled from).
export function decodeGen3Text(bytes) {
  let result = "";
  for (const byte of bytes) {
    if (byte === STRING_TERMINATOR_BYTE) break;
    const char = CHARMAP_TABLE[byte];
    if (char !== undefined) {
      result += char;
    }
  }
  return result;
}

// STATUS1 bitfield decoding (bit layout confirmed against
// include/constants/battle.h): bits 0-2 sleep-turns-remaining, bit 3
// poison, bit 4 burn, bit 5 freeze, bit 6 paralysis, bit 7 badly poisoned
// (toxic). Returns the single most game-relevant status name, since Gen III
// Pokemon can only have one non-volatile status condition at a time by
// construction (the game never sets more than one of these bit groups).
export function decodeStatusCondition(status1) {
  if ((status1 & 0x07) !== 0) return "asleep";
  if ((status1 & 0x80) !== 0) return "badly-poisoned";
  if ((status1 & 0x08) !== 0) return "poisoned";
  if ((status1 & 0x10) !== 0) return "burned";
  if ((status1 & 0x20) !== 0) return "frozen";
  if ((status1 & 0x40) !== 0) return "paralyzed";
  return "none";
}

// Gender derivation (confirmed against pokemon.c's
// GetGenderFromSpeciesAndPersonality): genderRatio 0 = always male, 254 =
// always female, 255 = genderless (sentinels), otherwise compare the
// personality value's low byte against the species' genderRatio threshold.
export function deriveGender(genderRatio, personality) {
  if (genderRatio === null || genderRatio === undefined) return null;
  if (genderRatio === 0) return "male";
  if (genderRatio === 254) return "female";
  if (genderRatio === 255) return "genderless";
  return genderRatio > (personality & 0xff) ? "female" : "male";
}

// Max PP for one equipped move, including PP Up bonuses (confirmed against
// pokemon.c's CalculatePPWithBonus): each PP Up adds 20% of the move's base
// PP, up to 3 PP Ups (60%) per move slot, encoded 2 bits per slot in the
// Growth substruct's ppBonuses byte.
export function calculateMaxPp(basePp, ppBonuses, moveIndex) {
  const bonusCount = (ppBonuses >> (2 * moveIndex)) & 0x3;
  return basePp + Math.floor((basePp * 20 * bonusCount) / 100);
}

// EXP-to-level curves (formulas confirmed against
// src/data/pokemon/experience_tables.h; growth-rate array order there is
// medium-fast, erratic, fluctuating, medium-slow, fast, slow, matching the
// GROWTH_* constant values these growth-rate name strings map back to).
const EXP_FORMULAS = {
  "medium-fast": (n) => n ** 3,
  fast: (n) => Math.floor((4 * n ** 3) / 5),
  slow: (n) => Math.floor((5 * n ** 3) / 4),
  "medium-slow": (n) => Math.floor((6 * n ** 3) / 5 - 15 * n ** 2 + 100 * n - 140),
  erratic: (n) => {
    if (n <= 50) return Math.floor(((100 - n) * n ** 3) / 50);
    if (n <= 68) return Math.floor(((150 - n) * n ** 3) / 100);
    if (n <= 98) return Math.floor((Math.floor((1911 - 10 * n) / 3) * n ** 3) / 500);
    return Math.floor(((160 - n) * n ** 3) / 100);
  },
  fluctuating: (n) => {
    if (n <= 15) return Math.floor((Math.floor((n + 1) / 3) + 24) * n ** 3 / 50);
    if (n <= 36) return Math.floor(((n + 14) * n ** 3) / 50);
    return Math.floor((Math.floor(n / 2) + 32) * (n ** 3) / 50);
  },
};

export function expForLevel(growthRate, level) {
  const formula = EXP_FORMULAS[growthRate];
  if (!formula || !Number.isInteger(level) || level < 1 || level > 100) return null;
  if (level === 1) return 0;
  return Math.max(0, formula(level));
}

// Returns { currentLevelExp, expToNextLevel, percent } describing progress
// from the current level's EXP threshold toward the next level's, or null
// if growthRate is unknown or the Pokemon is already level 100 (no next
// level exists). Never fabricates progress for level 100 - "no next level"
// is represented as null, not a fake 100%.
export function expProgress(growthRate, level, exp) {
  if (level >= 100) return null;
  const currentThreshold = expForLevel(growthRate, level);
  const nextThreshold = expForLevel(growthRate, level + 1);
  if (currentThreshold === null || nextThreshold === null || nextThreshold <= currentThreshold) {
    return null;
  }
  const span = nextThreshold - currentThreshold;
  const into = Math.min(Math.max(exp - currentThreshold, 0), span);
  return Object.freeze({
    expIntoLevel: into,
    expForNextLevel: span,
    percent: Math.round((into / span) * 1000) / 10,
  });
}

// Resolves a ball's catch-rate multiplier for the current opponent, or null
// when the ball's real bonus depends on state this project does not decode
// (see the BALLS_TABLE "unavailable" entries' `reason`). Never guesses a
// value for those; the caller must treat null as "not shown", not "no
// bonus". Confirmed against pret/pokeemerald's real Cmd_handleballthrow
// (src/battle_script_commands.c) - see docs/tasks/P05/P05-T011.md.
export function resolveBallMultiplier(ballInfo, { opponentTypes, opponentLevel } = {}) {
  if (!ballInfo) return null;
  switch (ballInfo.kind) {
    case "guaranteed":
      return { guaranteed: true };
    case "static":
      return { multiplier: ballInfo.multiplier };
    case "type-conditional": {
      const matches = Array.isArray(opponentTypes) && opponentTypes.some((type) => ballInfo.matchTypes.includes(type));
      return { multiplier: matches ? ballInfo.multiplierIfMatch : ballInfo.multiplierOtherwise };
    }
    case "level-conditional": {
      // Nest Ball (Cmd_handleballthrow): 40 - level, floored at 10, only below level 40.
      if (!Number.isInteger(opponentLevel)) return null;
      if (opponentLevel >= 40) return { multiplier: 10 };
      return { multiplier: Math.max(10, 40 - opponentLevel) };
    }
    default:
      return null; // "unavailable" - depends on undecoded state
  }
}

// Real Gen III catch-probability formula, transcribed field-for-field from
// pret/pokeemerald's Cmd_handleballthrow (src/battle_script_commands.c):
// odds = floor(catchRate * ballMultiplier / 10) * (3*maxHp - 2*currentHp) / (3*maxHp)
// doubled for sleep/freeze, x1.5 for poison/burn/paralysis/badly-poisoned;
// odds > 254 is a guaranteed catch, otherwise the probability of surviving
// all four of the game's shake checks is computed from the same integer
// double-square-root step the game itself performs (mirrored here with
// Math.sqrt/Math.floor rather than the game's integer Sqrt() twice - a
// disclosed floating-point re-implementation of the identical formula, not
// a different one; values in this range have no meaningful precision loss
// versus IEEE-754 doubles). Returns a probability in [0, 1], or null if a
// required input is missing/unusable - never a fabricated number.
export function calculateCatchChance({ catchRate, ballMultiplier, maxHp, currentHp, status }) {
  if (!Number.isInteger(catchRate) || catchRate < 0) return null;
  if (!ballMultiplier) return null;
  if (ballMultiplier.guaranteed) return 1;
  if (!Number.isInteger(ballMultiplier.multiplier)) return null;
  if (!Number.isInteger(maxHp) || maxHp <= 0 || !Number.isInteger(currentHp) || currentHp < 0) return null;

  let odds = Math.floor((catchRate * ballMultiplier.multiplier) / 10);
  odds = Math.floor((odds * (maxHp * 3 - currentHp * 2)) / (3 * maxHp));

  if (status === "asleep" || status === "frozen") odds *= 2;
  if (status === "poisoned" || status === "burned" || status === "paralyzed" || status === "badly-poisoned") {
    odds = Math.floor((odds * 15) / 10);
  }

  if (odds > 254) return 1;
  if (odds <= 0) return 0;

  const innerQuotient = Math.floor(16711680 / odds);
  const firstSqrt = Math.floor(Math.sqrt(innerQuotient));
  const b = Math.floor(Math.sqrt(firstSqrt));
  if (b <= 0) return 1;

  const shakeThreshold = Math.min(65535, Math.floor(1048560 / b));
  const shakeProbability = shakeThreshold / 65536;
  return Math.min(1, shakeProbability ** 4);
}
