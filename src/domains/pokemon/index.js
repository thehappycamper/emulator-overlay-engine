import { calculateBagBallChances, calculateCaptureChance } from "./capture.js";
import { calculateDamageRange, projectIncomingDamage } from "./damage.js";
import {
  POKEMON_EVENT_DETECTORS,
  detectPokemonEvents,
  matchPartyMembers,
  pokemonIdentityKey,
} from "./events.js";
import { renderPokemonOverlay } from "./presentation.js";
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

export const pokemonPresentation = Object.freeze({
  renderOverlay: renderPokemonOverlay,
  stylesheets: Object.freeze(["/src/domains/pokemon/presentation.css"])
});

export const pokemonEvents = Object.freeze({
  detect: detectPokemonEvents,
  detectors: POKEMON_EVENT_DETECTORS
});

export const pokemonDomain = Object.freeze({
  id: "pokemon",
  stateContract: pokemonStateContract,
  calculators,
  presentation: pokemonPresentation,
  events: pokemonEvents
});

export {
  calculateBagBallChances,
  calculateCaptureChance,
  calculateDamageRange,
  detectPokemonEvents,
  matchPartyMembers,
  pokemonIdentityKey,
  projectIncomingDamage,
  renderPokemonOverlay,
  typeEffectiveness
};
