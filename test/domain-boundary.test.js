import assert from "node:assert/strict";
import test from "node:test";
import { resolveDomain } from "../src/domains/index.js";
import {
  pokemonDomain,
  pokemonPresentation,
  pokemonStateContract
} from "../src/domains/pokemon/index.js";
import { calculateCaptureChance as legacyCalculateCaptureChance } from "../src/engine/capture.js";

test("Pokemon resolves through the application domain boundary", () => {
  const domain = resolveDomain("pokemon");

  assert.strictEqual(domain, pokemonDomain);
  assert.equal(domain.id, "pokemon");
  assert.strictEqual(domain.stateContract, pokemonStateContract);
  assert.deepEqual(domain.stateContract, {
    id: "pokemon.overlay-state",
    type: "normalized-state",
    version: "0.1.0",
    schema: "https://emulator-overlay-engine.local/schemas/overlay-state.schema.json"
  });
  assert.equal(domain.calculators.typeEffectiveness("ice", ["dragon", "flying"]), 4);
  assert.strictEqual(domain.presentation, pokemonPresentation);
  assert.equal(typeof domain.presentation.renderOverlay, "function");
});

test("unknown application domains fail deterministically", () => {
  assert.throws(() => resolveDomain("unknown"), {
    message: "Unknown domain: unknown"
  });
});

test("legacy engine imports remain compatible during incremental migration", () => {
  assert.strictEqual(
    legacyCalculateCaptureChance,
    pokemonDomain.calculators.calculateCaptureChance
  );
});
