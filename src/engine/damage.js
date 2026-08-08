import { typeEffectiveness } from "./type-chart.js";

const rollFactors = Array.from({ length: 16 }, (_, index) => (85 + index) / 100);

export function calculateDamageRange({ attacker, defender, move, modifiers = {} }) {
  if (!attacker || !defender || !move) {
    throw new Error("attacker, defender, and move are required");
  }

  if (move.category === "status" || move.power <= 0) {
    return emptyDamage(move, defender);
  }

  const attackStat = move.category === "physical" ? attacker.stats.atk : attacker.stats.spa;
  const defenseStat = move.category === "physical" ? defender.stats.def : defender.stats.spd;
  const stab = (attacker.types || []).map((type) => type.toLowerCase()).includes(move.type.toLowerCase()) ? 1.5 : 1;
  const effectiveness = typeEffectiveness(move.type, defender.types);
  const burn = modifiers.burnedPhysicalAttacker && move.category === "physical" ? 0.5 : 1;
  const other = modifiers.other ?? 1;

  const base = Math.floor(Math.floor(Math.floor((2 * attacker.level) / 5 + 2) * move.power * attackStat / defenseStat) / 50) + 2;
  const damages = rollFactors.map((roll) => Math.floor(base * stab * effectiveness * burn * other * roll));

  return {
    move: move.name,
    category: move.category,
    effectiveness,
    min: Math.min(...damages),
    max: Math.max(...damages),
    minPercent: percent(Math.min(...damages), defender.maxHp),
    maxPercent: percent(Math.max(...damages), defender.maxHp),
    guaranteedKo: Math.min(...damages) >= defender.currentHp,
    possibleKo: Math.max(...damages) >= defender.currentHp
  };
}

export function projectIncomingDamage(opponent, party, options = {}) {
  return party.map((pokemon) => {
    const ranges = opponent.moves
      .filter((move) => move.category !== "status" && move.power > 0)
      .map((move) => calculateDamageRange({
        attacker: opponent,
        defender: pokemon,
        move,
        modifiers: options.modifiers
      }))
      .sort((left, right) => right.maxPercent - left.maxPercent);

    return {
      target: pokemon.nickname || pokemon.name,
      hp: `${pokemon.currentHp}/${pokemon.maxHp}`,
      worstCase: ranges[0] ?? null,
      ranges
    };
  });
}

function emptyDamage(move, defender) {
  return {
    move: move.name,
    category: move.category,
    effectiveness: 1,
    min: 0,
    max: 0,
    minPercent: 0,
    maxPercent: 0,
    guaranteedKo: false,
    possibleKo: false
  };
}

function percent(value, total) {
  return Math.round((value / total) * 1000) / 10;
}
