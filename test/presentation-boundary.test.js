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

  assert.match(html, /<details class="stat-compare" data-disclosure-id="battle-stat-compare">/);
  assert.doesNotMatch(html, /<details class="stat-compare"[^>]* open/);
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

test("battle stat comparison shows a positive stat stage as a distinguishable (+N) suffix", () => {
  const state = readSampleState();
  state.battle.player = { statStages: { atk: 2, def: 0, spe: 0, spa: 0, spd: 0, acc: 0, eva: 0 } };
  const html = renderPokemonOverlay(state);
  assert.match(html, /<span class="stat-stage stage-up">\(\+2\)<\/span>/);
});

test("battle stat comparison shows a negative stat stage as a distinguishable (-N) suffix", () => {
  const state = readSampleState();
  state.battle.opponent.statStages = { atk: 0, def: -3, spe: 0, spa: 0, spd: 0, acc: 0, eva: 0 };
  const html = renderPokemonOverlay(state);
  assert.match(html, /<span class="stat-stage stage-down">\(-3\)<\/span>/);
});

test("battle stat comparison shows stage-adjusted value and base for a non-neutral stage", () => {
  const state = readSampleState();
  state.player.party[0].stats.atk = 100;
  state.battle.player = { statStages: { atk: 2, def: 0, spe: 0, spa: 0, spd: 0, acc: 0, eva: 0 } };
  const html = renderPokemonOverlay(state);
  const attackRow = html.match(/<tr>\s*<th scope="row">Attack<\/th>[\s\S]*?<\/tr>/)?.[0];
  assert.ok(attackRow);
  assert.match(attackRow, />200/);
  assert.match(attackRow, /\(\+2\)/);
  assert.match(attackRow, /base 100/);
});

test("battle stat comparison prefers the mapping layer's precomputed stageAdjustedStats over recalculating, for both player and opponent", () => {
  const state = readSampleState();
  state.player.party[0].stats.atk = 100;
  // Deliberately wrong precomputed values (mathematically, +2 on base 100
  // is 200, and +2 on the opponent's real base is not 999) - if
  // presentation silently recalculated instead of consuming these, the
  // mismatch would go undetected. `battle.player.stageAdjustedStats` in
  // particular lives on a different object than `activePlayer` (the party
  // slot), which is the exact wiring this test locks in.
  state.battle.player = {
    statStages: { atk: 2, def: 0, spe: 0, spa: 0, spd: 0, acc: 0, eva: 0 },
    stageAdjustedStats: { atk: 555, def: 0, spa: 0, spd: 0, spe: 0 },
  };
  state.battle.opponent.statStages = { atk: 2, def: 0, spe: 0, spa: 0, spd: 0, acc: 0, eva: 0 };
  state.battle.opponent.stageAdjustedStats = { atk: 777, def: 0, spa: 0, spd: 0, spe: 0 };
  const html = renderPokemonOverlay(state);
  const attackRow = html.match(/<tr>\s*<th scope="row">Attack<\/th>[\s\S]*?<\/tr>/)?.[0];
  assert.ok(attackRow);
  assert.match(attackRow, />555/, "the player column must show the precomputed 555, not a recalculated 200");
  assert.match(attackRow, />777/, "the opponent column must show the precomputed 777, not a recalculated value");
});

test("battle stat comparison shows a neutral stat stage as (+0), distinguishable from a boost/drop by CSS class", () => {
  const state = readSampleState();
  state.battle.player = { statStages: { atk: 0, def: 0, spe: 0, spa: 0, spd: 0, acc: 0, eva: 0 } };
  const html = renderPokemonOverlay(state);
  assert.match(html, /<span class="stat-stage stage-neutral">\(\+0\)<\/span>/);
});

test("battle stat comparison shows no stage suffix at all when stage data is unavailable, never fabricating (+0)", () => {
  const state = readSampleState();
  // Neither battle.player nor opponent.statStages is populated - the
  // sample state's default shape - so no stat-stage span should render
  // anywhere, and the panel must still be usable (real values still show).
  delete state.battle.player;
  delete state.battle.opponent.statStages;
  const html = renderPokemonOverlay(state);
  assert.doesNotMatch(html, /stat-stage/);
  assert.match(html, /<table class="stat-compare-table">/);
});

test("battle stat comparison represents Accuracy and Evasion stage changes, even though they have no underlying numeric stat", () => {
  const state = readSampleState();
  state.battle.player = { statStages: { atk: 0, def: 0, spe: 0, spa: 0, spd: 0, acc: -2, eva: 0 } };
  state.battle.opponent.statStages = { atk: 0, def: 0, spe: 0, spa: 0, spd: 0, acc: 0, eva: 1 };
  const html = renderPokemonOverlay(state);
  const accuracyRow = html.match(/<tr>\s*<th scope="row">Accuracy<\/th>[\s\S]*?<\/tr>/)?.[0];
  const evasionRow = html.match(/<tr>\s*<th scope="row">Evasion<\/th>[\s\S]*?<\/tr>/)?.[0];
  assert.ok(accuracyRow, "an Accuracy row must be present in the comparison table");
  assert.ok(evasionRow, "an Evasion row must be present in the comparison table");
  assert.match(accuracyRow, /<span class="stat-stage stage-down">\(-2\)<\/span>/);
  assert.match(evasionRow, /<span class="stat-stage stage-up">\(\+1\)<\/span>/);
});

test("wild encounter panel (P05-T011) is collapsed by default and lists the real per-location table", () => {
  const state = readSampleState();
  const html = renderPokemonOverlay(state);

  assert.match(html, /<details class="encounters-panel" data-disclosure-id="location-encounters">/);
  assert.doesNotMatch(html, /<details class="encounters-panel"[^>]* open/);
  assert.match(html, /Wild Encounters Here \(4\)/);
  assert.match(html, /Zigzagoon/i);
});

test("wild encounter panel shows an explicit no-encounters message rather than an empty table", () => {
  const state = readSampleState();
  state.location.encounters = [];
  assert.match(renderPokemonOverlay(state), /No wild encounters at this location\./);

  delete state.location.encounters;
  assert.match(renderPokemonOverlay(state), /No wild encounters at this location\./);
});

test("Poke Ball catch-odds panel (P05-T011) renders only during an explicitly wild (non-trainer) battle", () => {
  const state = readSampleState();
  state.battle.trainerBattle = false;
  const wildHtml = renderPokemonOverlay(state);
  assert.match(wildHtml, /<details class="balls-panel" data-disclosure-id="battle-balls">/);
  assert.doesNotMatch(wildHtml, /<details class="balls-panel"[^>]* open/);
  assert.match(wildHtml, /Poke Ball/);

  state.battle.trainerBattle = true;
  assert.doesNotMatch(renderPokemonOverlay(state), /balls-panel/);
});

test("Poke Ball catch-odds panel does not render when trainerBattle is unknown, to avoid implying balls can be thrown", () => {
  const state = readSampleState();
  delete state.battle.trainerBattle;
  assert.doesNotMatch(renderPokemonOverlay(state), /balls-panel/);
});

test("Poke Ball catch-odds panel does not render outside of battle even with balls in the bag", () => {
  const state = readSampleState();
  state.battle.trainerBattle = false;
  state.battle.opponent = null;
  assert.doesNotMatch(renderPokemonOverlay(state), /balls-panel/);
});

test("Poke Ball catch-odds panel shows a numeric percent when computed and an honest 'unavailable' marker when not", () => {
  const state = readSampleState();
  state.battle.trainerBattle = false;
  state.bag.balls = [
    { id: 4, name: "Poke Ball", quantity: 5, catchChance: 0.42 },
    { id: 7, name: "Dive Ball", quantity: 1, catchChance: null },
  ];
  const html = renderPokemonOverlay(state);
  assert.match(html, /42\.0%/);
  assert.match(html, /unavailable/);
});

test("Poke Ball catch-odds panel escapes HTML-significant ball names", () => {
  const state = readSampleState();
  state.battle.trainerBattle = false;
  state.bag.balls = [{ id: 4, name: '<img src=x onerror=alert(1)>', quantity: 1, catchChance: 0.1 }];
  const html = renderPokemonOverlay(state);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
