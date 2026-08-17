import {
  calculateBagBallChances,
  calculateCaptureChance,
  calculateDamageRange,
  pokemonPresentation,
  pokemonStateContract,
  projectIncomingDamage,
  renderPokemonOverlay,
  typeEffectiveness,
} from "./presentation-descriptor.js";
import { POKEMON_EVENT_DETECTORS, detectPokemonEvents, matchPartyMembers, pokemonIdentityKey } from "./events.js";

const calculators = Object.freeze({
  calculateBagBallChances,
  calculateCaptureChance,
  calculateDamageRange,
  projectIncomingDamage,
  typeEffectiveness
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
  pokemonPresentation,
  pokemonStateContract,
  projectIncomingDamage,
  renderPokemonOverlay,
  typeEffectiveness
};
