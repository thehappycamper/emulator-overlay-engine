import { calculateBagBallChances, calculateCaptureChance } from "./capture.js";
import { calculateDamageRange, projectIncomingDamage } from "./damage.js";
import { typeEffectiveness } from "./type-chart.js";

const calculators = Object.freeze({
  calculateBagBallChances,
  calculateCaptureChance,
  calculateDamageRange,
  projectIncomingDamage,
  typeEffectiveness
});

export const pokemonStateContract = Object.freeze({
  id: "pokemon.overlay-state",
  type: "normalized-state",
  version: "0.1.0",
  schema: "https://emulator-overlay-engine.local/schemas/overlay-state.schema.json"
});

export const pokemonDomain = Object.freeze({
  id: "pokemon",
  stateContract: pokemonStateContract,
  calculators
});

export {
  calculateBagBallChances,
  calculateCaptureChance,
  calculateDamageRange,
  projectIncomingDamage,
  typeEffectiveness
};
