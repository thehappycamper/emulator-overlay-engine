import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  pokemonDomain,
  pokemonPresentation,
  renderPokemonOverlay
} from "../src/domains/pokemon/index.js";
import {
  getDomainOverlayPresentation,
  renderDomainOverlay
} from "../src/overlay/host.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readSampleState() {
  return JSON.parse(readFileSync(join(repositoryRoot, "public", "sample-state.json"), "utf8"));
}

test("Pokemon exposes its overlay presentation through the domain boundary", () => {
  assert.strictEqual(pokemonDomain.presentation, pokemonPresentation);
  assert.strictEqual(pokemonPresentation.renderOverlay, renderPokemonOverlay);
  assert.deepEqual(pokemonPresentation.stylesheets, ["/src/domains/pokemon/presentation.css"]);
  assert.ok(Object.isFrozen(pokemonPresentation));
  assert.ok(Object.isFrozen(pokemonPresentation.stylesheets));
});

test("the generic overlay host dispatches an unrelated presentation descriptor", () => {
  const renderOverlay = (state) => `<output>${state.value}</output>`;
  const domain = {
    id: "example",
    presentation: {
      renderOverlay,
      stylesheets: ["/example.css"]
    }
  };

  assert.strictEqual(getDomainOverlayPresentation(domain), domain.presentation);
  assert.equal(renderDomainOverlay(domain, { value: "ready" }), "<output>ready</output>");
});

test("the generic overlay host rejects missing or malformed presentation capabilities", () => {
  assert.throws(() => getDomainOverlayPresentation(null), {
    name: "TypeError",
    message: "A domain descriptor is required for overlay presentation"
  });
  assert.throws(() => renderDomainOverlay({ id: "headless" }, {}), {
    message: "Domain headless does not provide overlay presentation"
  });
  assert.throws(
    () => getDomainOverlayPresentation({
      id: "invalid-style",
      presentation: { renderOverlay() {}, stylesheets: [""] }
    }),
    {
      name: "TypeError",
      message: "Domain invalid-style overlay stylesheets must be non-empty strings"
    }
  );
  assert.throws(
    () => renderDomainOverlay({
      id: "invalid-markup",
      presentation: { renderOverlay: () => ({}) }
    }, {}),
    {
      name: "TypeError",
      message: "Domain invalid-markup overlay renderer must return a string"
    }
  );
});

test("Pokemon rendering preserves the current static overlay content without mutating state", () => {
  const state = readSampleState();
  const originalState = structuredClone(state);
  const html = renderDomainOverlay(pokemonDomain, state);

  assert.match(html, /Pokemon Emerald/);
  assert.match(html, /<h2>Party<\/h2>/);
  assert.match(html, /MUD/);
  assert.match(html, /Earthquake/);
  assert.match(html, /<h2>Opponent<\/h2>/);
  assert.match(html, /Projected Switch Damage/);
  assert.match(html, /Catch Odds/);
  assert.match(html, /Poke Ball x12/);
  assert.match(html, /<h2>Route Encounters<\/h2>/);
  assert.match(html, /Kecleon/);
  assert.match(html, /<dt>Seed<\/dt>/);
  assert.match(html, /<dt>Frame<\/dt>/);
  assert.match(html, /<dt>Score<\/dt>/);
  assert.deepEqual(state, originalState);
});

test("Pokemon rendering preserves the no-opponent fallback", () => {
  const state = readSampleState();
  state.battle.opponent = null;

  assert.match(renderPokemonOverlay(state), /No opponent detected\./);
});
