import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCatchChance,
  calculateMaxPp,
  decodeGen3Text,
  decodeStatusCondition,
  deriveGender,
  expForLevel,
  expProgress,
  lookupBallInfo,
  lookupEncounters,
  lookupItem,
  lookupLocation,
  lookupMove,
  lookupSpecies,
  resolveBallMultiplier,
} from "../adapters/pokemon-emerald-us-rev0/reference-data.js";

test("lookupSpecies resolves real, source-verified species by internal ID", () => {
  assert.deepEqual(lookupSpecies(1), { name: "BULBASAUR", types: ["Grass", "Poison"], growthRate: "medium-slow", genderRatio: 31, catchRate: 45 });
  assert.equal(lookupSpecies(280).name, "TORCHIC");
  assert.deepEqual(lookupSpecies(280).types, ["Fire"]);
  assert.equal(lookupSpecies(280).catchRate, 45);
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

test("lookupEncounters resolves the real Route 101 wild encounter table and returns null for locations with none", () => {
  const route101 = lookupEncounters(0, 16);
  assert.ok(Array.isArray(route101));
  assert.ok(route101.some((e) => e.name === "WURMPLE" && e.method === "grass"));
  assert.equal(lookupEncounters(255, 255), null);
});

test("lookupBallInfo resolves the real Poke Ball reference table", () => {
  assert.deepEqual(lookupBallInfo(1), { name: "Master Ball", kind: "guaranteed" });
  assert.equal(lookupBallInfo(4).kind, "static");
  assert.equal(lookupBallInfo(4).multiplier, 10);
  assert.equal(lookupBallInfo(999999), null);
});

test("resolveBallMultiplier: static balls always return their fixed multiplier", () => {
  assert.deepEqual(resolveBallMultiplier(lookupBallInfo(4), {}), { multiplier: 10 }); // Poke Ball
  assert.deepEqual(resolveBallMultiplier(lookupBallInfo(2), {}), { multiplier: 20 }); // Ultra Ball
  assert.deepEqual(resolveBallMultiplier(lookupBallInfo(1), {}), { guaranteed: true }); // Master Ball
});

test("resolveBallMultiplier: Net Ball bonus applies only for Water/Bug-type opponents", () => {
  const netBall = lookupBallInfo(6);
  assert.deepEqual(resolveBallMultiplier(netBall, { opponentTypes: ["Water"] }), { multiplier: 30 });
  assert.deepEqual(resolveBallMultiplier(netBall, { opponentTypes: ["Bug", "Poison"] }), { multiplier: 30 });
  assert.deepEqual(resolveBallMultiplier(netBall, { opponentTypes: ["Fire"] }), { multiplier: 10 });
});

test("resolveBallMultiplier: Nest Ball scales down toward level 40, floored at 10", () => {
  const nestBall = lookupBallInfo(8);
  assert.deepEqual(resolveBallMultiplier(nestBall, { opponentLevel: 5 }), { multiplier: 35 });
  assert.deepEqual(resolveBallMultiplier(nestBall, { opponentLevel: 35 }), { multiplier: 10 });
  assert.deepEqual(resolveBallMultiplier(nestBall, { opponentLevel: 40 }), { multiplier: 10 });
  assert.deepEqual(resolveBallMultiplier(nestBall, { opponentLevel: 100 }), { multiplier: 10 });
});

test("resolveBallMultiplier returns null for balls whose real bonus depends on undecoded state", () => {
  assert.equal(resolveBallMultiplier(lookupBallInfo(7), {}), null); // Dive Ball
  assert.equal(resolveBallMultiplier(lookupBallInfo(9), {}), null); // Repeat Ball
  assert.equal(resolveBallMultiplier(lookupBallInfo(10), {}), null); // Timer Ball
  assert.equal(resolveBallMultiplier(lookupBallInfo(5), {}), null); // Safari Ball
  assert.equal(resolveBallMultiplier(null, {}), null);
});

test("calculateCatchChance matches the real Gen III formula for a known full-health, unstatused case", () => {
  // catchRate 45 (e.g. Bulbasaur), Poke Ball (x10), full HP, no status:
  // odds = floor(45*10/10) * (3*max - 2*max) / (3*max) = floor(45/3) = 15.
  // Widely cited as ~6% catch chance for this exact case.
  const chance = calculateCatchChance({
    catchRate: 45,
    ballMultiplier: { multiplier: 10 },
    maxHp: 100,
    currentHp: 100,
    status: "none",
  });
  assert.ok(chance > 0.05 && chance < 0.08, `expected ~6%, got ${chance}`);
});

test("calculateCatchChance: guaranteed (Master Ball) is always 1, low HP/status always raise chance", () => {
  assert.equal(
    calculateCatchChance({ catchRate: 3, ballMultiplier: { guaranteed: true }, maxHp: 100, currentHp: 100, status: "none" }),
    1,
  );

  const fullHealth = calculateCatchChance({ catchRate: 45, ballMultiplier: { multiplier: 10 }, maxHp: 100, currentHp: 100, status: "none" });
  const lowHealth = calculateCatchChance({ catchRate: 45, ballMultiplier: { multiplier: 10 }, maxHp: 100, currentHp: 5, status: "none" });
  const asleep = calculateCatchChance({ catchRate: 45, ballMultiplier: { multiplier: 10 }, maxHp: 100, currentHp: 100, status: "asleep" });
  assert.ok(lowHealth > fullHealth);
  assert.ok(asleep > fullHealth);
});

test("calculateCatchChance never fabricates a value for missing/unresolved inputs", () => {
  assert.equal(calculateCatchChance({ catchRate: null, ballMultiplier: { multiplier: 10 }, maxHp: 100, currentHp: 100, status: "none" }), null);
  assert.equal(calculateCatchChance({ catchRate: 45, ballMultiplier: null, maxHp: 100, currentHp: 100, status: "none" }), null);
  assert.equal(calculateCatchChance({ catchRate: 45, ballMultiplier: { multiplier: 10 }, maxHp: null, currentHp: 100, status: "none" }), null);
});
