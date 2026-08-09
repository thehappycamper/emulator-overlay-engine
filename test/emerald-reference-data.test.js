import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateMaxPp,
  decodeGen3Text,
  decodeStatusCondition,
  deriveGender,
  expForLevel,
  expProgress,
  lookupItem,
  lookupLocation,
  lookupMove,
  lookupSpecies,
} from "../adapters/pokemon-emerald-us-rev0/reference-data.js";

test("lookupSpecies resolves real, source-verified species by internal ID", () => {
  assert.deepEqual(lookupSpecies(1), { name: "BULBASAUR", types: ["Grass", "Poison"], growthRate: "medium-slow", genderRatio: 31 });
  assert.equal(lookupSpecies(280).name, "TORCHIC");
  assert.deepEqual(lookupSpecies(280).types, ["Fire"]);
  assert.equal(lookupSpecies(999999), null);
});

test("lookupMove resolves real move name/type/category/power/accuracy/pp", () => {
  const tackle = lookupMove(33);
  assert.equal(tackle.name, "TACKLE");
  assert.equal(tackle.category, "physical");
  const thunderbolt = lookupMove(85);
  assert.equal(thunderbolt.category, "special");
  assert.equal(lookupMove(999999), null);
});

test("lookupItem resolves real item names and treats item ID 0 as no item", () => {
  assert.equal(lookupItem(13), "POTION");
  assert.equal(lookupItem(0), null);
  assert.equal(lookupItem(999999), null);
});

test("lookupLocation resolves map group/number to a readable location name", () => {
  assert.equal(typeof lookupLocation(0, 0), "string");
  assert.equal(lookupLocation(255, 255), null);
});

test("decodeGen3Text stops at the 0xFF terminator and ignores trailing padding", () => {
  assert.equal(decodeGen3Text([0xbb, 0xbc, 0xbd, 0xff, 0xff, 0xff]), "ABC");
  assert.equal(decodeGen3Text([0xff]), "");
  assert.equal(decodeGen3Text([]), "");
});

test("decodeGen3Text decodes digits and full names without a terminator present", () => {
  // 'A'=0xBB..'Z'=0xD4, '0'=0xA1..'9'=0xAA (charmap.txt-confirmed values).
  assert.equal(decodeGen3Text([0xbb, 0xbc, 0xbd]), "ABC");
  assert.equal(decodeGen3Text([0xa1, 0xa2, 0xa3]), "012");
});

test("decodeStatusCondition covers every STATUS1 bit independently, sleep taking priority", () => {
  assert.equal(decodeStatusCondition(0), "none");
  assert.equal(decodeStatusCondition(0x01), "asleep"); // any nonzero sleep-turn count
  assert.equal(decodeStatusCondition(0x07), "asleep");
  assert.equal(decodeStatusCondition(0x08), "poisoned");
  assert.equal(decodeStatusCondition(0x10), "burned");
  assert.equal(decodeStatusCondition(0x20), "frozen");
  assert.equal(decodeStatusCondition(0x40), "paralyzed");
  assert.equal(decodeStatusCondition(0x80), "badly-poisoned");
  // Sleep bits take priority over any other status bit also being set,
  // matching the game's own single-active-status invariant.
  assert.equal(decodeStatusCondition(0x01 | 0x10), "asleep");
});

test("deriveGender handles the always-male/always-female/genderless sentinels and the ratio comparison", () => {
  assert.equal(deriveGender(0, 12345), "male");
  assert.equal(deriveGender(254, 12345), "female");
  assert.equal(deriveGender(255, 12345), "genderless");
  assert.equal(deriveGender(null, 12345), null);
  // genderRatio > (personality & 0xFF) => female, else male (confirmed
  // against pokemon.c's GetGenderFromSpeciesAndPersonality).
  assert.equal(deriveGender(31, 0x00000005), "female"); // 31 > 5
  assert.equal(deriveGender(31, 0x00000020), "male"); // 31 <= 32
});

test("calculateMaxPp adds 20% of base PP per PP Up, up to 3 per move slot, 2 bits per slot", () => {
  assert.equal(calculateMaxPp(35, 0, 0), 35); // no bonus
  assert.equal(calculateMaxPp(35, 0b01, 0), 42); // move 0, 1 PP Up: 35 + 7
  assert.equal(calculateMaxPp(35, 0b10, 0), 49); // move 0, 2 PP Ups (bits 0-1 = 0b10 = 2): 35 + 14
  assert.equal(calculateMaxPp(35, 0b1111, 0), 56); // move 0 bits (0-1) = 0b11 = 3 PP Ups: 35 + 21
  assert.equal(calculateMaxPp(40, 0b0100, 1), 48); // move 1, 1 PP Up: 40 + 8
});

test("expForLevel matches source-verified formulas for representative growth rates and levels", () => {
  assert.equal(expForLevel("medium-fast", 1), 0);
  assert.equal(expForLevel("medium-fast", 10), 1000); // n^3
  assert.equal(expForLevel("fast", 10), 800); // 4n^3/5
  assert.equal(expForLevel("slow", 10), 1250); // 5n^3/4
  assert.equal(expForLevel("unknown-growth-rate", 10), null);
  assert.equal(expForLevel("medium-fast", 0), null);
  assert.equal(expForLevel("medium-fast", 101), null);
});

test("expProgress never fabricates progress past level 100 and clamps within [0, span]", () => {
  assert.equal(expProgress("medium-fast", 100, 999999), null);
  assert.equal(expProgress("unknown-growth-rate", 10, 500), null);

  const halfway = expProgress("medium-fast", 10, 1000 + Math.floor((1331 - 1000) / 2));
  assert.ok(halfway.percent > 45 && halfway.percent < 55);

  // Exp below the current level's own threshold clamps to 0%, not negative.
  const belowThreshold = expProgress("medium-fast", 10, 0);
  assert.equal(belowThreshold.expIntoLevel, 0);
  assert.equal(belowThreshold.percent, 0);

  // Exp already past the next level's threshold clamps to 100%, not >100%.
  const pastThreshold = expProgress("medium-fast", 10, 999999);
  assert.equal(pastThreshold.percent, 100);
});
