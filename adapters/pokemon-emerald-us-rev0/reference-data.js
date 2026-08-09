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
