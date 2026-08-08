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

export const pokemonDomain = Object.freeze({
  id: "pokemon",
  calculators
});

export {
  calculateBagBallChances,
  calculateCaptureChance,
  calculateDamageRange,
  projectIncomingDamage,
  typeEffectiveness
};
