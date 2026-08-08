import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBagBallChances,
  calculateCaptureChance,
  calculateDamageRange,
  projectIncomingDamage,
  typeEffectiveness
} from "../src/domains/pokemon/index.js";

const swampert = {
  name: "Swampert",
  level: 42,
  types: ["water", "ground"],
  currentHp: 138,
  maxHp: 146,
  stats: { atk: 118, def: 101, spa: 96, spd: 99 }
};

const absol = {
  name: "Absol",
  level: 40,
  types: ["dark"],
  currentHp: 44,
  maxHp: 121,
  stats: { atk: 130, def: 66, spa: 76, spd: 69 },
  moves: [
    { name: "Slash", type: "normal", category: "physical", power: 70 },
    { name: "Bite", type: "dark", category: "special", power: 60 }
  ]
};

test("type effectiveness multiplies across defender types", () => {
  assert.equal(typeEffectiveness("electric", ["water", "ground"]), 0);
  assert.equal(typeEffectiveness("ice", ["dragon", "flying"]), 4);
});

test("damage calculator returns a bounded damage range", () => {
  const range = calculateDamageRange({
    attacker: swampert,
    defender: absol,
    move: { name: "Earthquake", type: "ground", category: "physical", power: 100 }
  });

  assert.equal(range.move, "Earthquake");
  assert.ok(range.min > 0);
  assert.ok(range.max >= range.min);
  assert.ok(range.maxPercent > range.minPercent);
});

test("incoming damage projection ranks worst move first", () => {
  const [projection] = projectIncomingDamage(absol, [swampert]);
  assert.equal(projection.target, "Swampert");
  assert.equal(projection.worstCase.move, "Slash");
});

test("capture chance improves with stronger balls", () => {
  const pokemon = { maxHp: 121, currentHp: 44, catchRate: 30 };
  const pokeBall = calculateCaptureChance({ pokemon, ballModifier: 1, status: "sleep" });
  const ultraBall = calculateCaptureChance({ pokemon, ballModifier: 2, status: "sleep" });

  assert.ok(pokeBall > 0);
  assert.ok(ultraBall > pokeBall);
});

test("bag ball chances preserve inventory context", () => {
  const chances = calculateBagBallChances({
    pokemon: { maxHp: 121, currentHp: 44 },
    catchRate: 30,
    status: "sleep",
    balls: [{ id: 4, name: "Poke Ball", quantity: 12, modifier: 1 }]
  });

  assert.equal(chances[0].name, "Poke Ball");
  assert.equal(chances[0].quantity, 12);
  assert.ok(chances[0].chance > 0);
});
