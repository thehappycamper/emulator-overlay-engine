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

test("Pokemon rendering (P05-T009 dashboard redesign) shows team/battle content without mutating state", () => {
  const state = readSampleState();
  const originalState = structuredClone(state);
  const html = renderDomainOverlay(pokemonDomain, state);

  assert.match(html, /Pokemon Emerald/);
  assert.match(html, /<h2>Team<\/h2>/);
  assert.match(html, /MUD/);
  assert.match(html, /Earthquake/);
  assert.match(html, /<h2>Battle<\/h2>/);
  assert.match(html, /Projected Incoming Damage/);
  assert.deepEqual(state, originalState);
});

test("Pokemon rendering shows six team slots, rendering unoccupied slots intentionally rather than omitting them", () => {
  const state = readSampleState();
  const html = renderDomainOverlay(pokemonDomain, state);
  // Sample state has 2 party members; slots 3-6 must render as explicit
  // empty-slot cards, not be silently missing from the grid.
  const emptySlotCount = (html.match(/class="card team-card empty-slot"/g) || []).length;
  assert.equal(emptySlotCount, 4);
  assert.match(html, /No Pokemon/);
});

test("Pokemon rendering preserves the no-battle fallback", () => {
  const state = readSampleState();
  state.battle.opponent = null;

  assert.match(renderPokemonOverlay(state), /Not currently in battle\./);
});

test("Pokemon rendering handles a completely empty party and missing badges without throwing", () => {
  const state = readSampleState();
  state.player.party = [];
  delete state.player.badges;
  state.battle.opponent = null;

  const html = renderPokemonOverlay(state);
  const emptySlotCount = (html.match(/class="card team-card empty-slot"/g) || []).length;
  assert.equal(emptySlotCount, 6);
  assert.match(html, /Badges: unavailable/);
});

test("Pokemon rendering escapes HTML-significant characters in nicknames and species/location names", () => {
  const state = readSampleState();
  state.player.party[0].nickname = '<script>alert("x")</script>';
  const html = renderPokemonOverlay(state);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test("battle stat comparison (P05-T010) is collapsed by default and shows a player/opponent side-by-side table while in battle", () => {
  const state = readSampleState();
  const html = renderPokemonOverlay(state);

  assert.match(html, /<details class="stat-compare">/);
  assert.doesNotMatch(html, /<details class="stat-compare" open/);
  assert.match(html, /<summary>Compare Stats<\/summary>/);
  // Sample state: player party[0] Swampert (atk 118) vs Absol opponent (atk 130) - opponent has the attack advantage.
  assert.match(html, /Swampert/);
  assert.match(html, /Absol/);
  assert.match(html, /class="stat-indicator stat-disadvantage">&lt;/);
});

test("battle stat comparison marks the higher stat with a relative indicator in both directions", () => {
  const state = readSampleState();
  const html = renderPokemonOverlay(state);
  // Sample state: player party[0] Swampert (def 101) vs Absol opponent (def 66) - player has the defense advantage.
  assert.match(html, /class="stat-indicator stat-advantage">&gt;/);
});

test("battle stat comparison shows an unavailable marker rather than fabricating a value when a stat is missing", () => {
  const state = readSampleState();
  delete state.player.party[0].stats.atk;
  const html = renderPokemonOverlay(state);

  assert.match(html, /class="stat-indicator stat-unknown">&ndash;/);
});

test("battle stat comparison discloses that active-battler tracking is a placeholder", () => {
  const state = readSampleState();
  const html = renderPokemonOverlay(state);
  assert.match(html, /active-battler tracking is not yet implemented/);
});

test("battle stat comparison does not render outside of battle", () => {
  const state = readSampleState();
  state.battle.opponent = null;
  const html = renderPokemonOverlay(state);
  assert.doesNotMatch(html, /stat-compare/);
});

test("battle stat comparison reports unavailable rather than throwing when no player Pokemon occupies the active slot", () => {
  const state = readSampleState();
  state.player.party = [];
  const html = renderPokemonOverlay(state);
  assert.match(html, /No battle-ready party member available to compare\./);
  assert.doesNotMatch(html, /<table class="stat-compare-table">/);
});

test("battle stat comparison escapes HTML-significant nicknames in its table headers", () => {
  const state = readSampleState();
  state.player.party[0].nickname = '<img src=x onerror=alert(1)>';
  const html = renderPokemonOverlay(state);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
