import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateStageAdjustedStat,
  deriveStageAdjustedStats,
} from "../src/domains/pokemon/stat-stages.js";
import { mapEmeraldSourceSnapshot } from "../adapters/pokemon-emerald-us-rev0/emerald-state-mapping.js";
import { renderPokemonOverlay } from "../src/domains/pokemon/presentation.js";

const fixtureUrl = new URL(
  "../adapters/pokemon-emerald-us-rev0/fixtures/emerald-us-rev0.source.json",
  import.meta.url,
);

test("Gen III stage-adjusted stats use the authoritative integer ratios", () => {
  assert.equal(calculateStageAdjustedStat(100, -6), 25);
  assert.equal(calculateStageAdjustedStat(100, -1), 66);
  assert.equal(calculateStageAdjustedStat(100, 0), 100);
  assert.equal(calculateStageAdjustedStat(100, 1), 150);
  assert.equal(calculateStageAdjustedStat(100, 2), 200);
  assert.equal(calculateStageAdjustedStat(100, 6), 400);
  assert.equal(calculateStageAdjustedStat(7, -1), 4);
  assert.equal(calculateStageAdjustedStat(7, -2), 3);
  assert.equal(calculateStageAdjustedStat(7, 2), 14);
});

test("invalid or missing stages fail closed without fabricating a neutral adjustment", () => {
  assert.equal(calculateStageAdjustedStat(100, null), null);
  assert.equal(calculateStageAdjustedStat(100, -7), null);
  assert.equal(calculateStageAdjustedStat(100, 7), null);
  assert.equal(deriveStageAdjustedStats({ atk: 100 }, { atk: 0 }), null);
  assert.equal(deriveStageAdjustedStats({ atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, null), null);
  // All base stats present, but the stage object is missing one key
  // (`def`) rather than being entirely absent - this must still fail
  // closed for the whole result, not silently substitute a neutral 0
  // stage for the missing key alone.
  assert.equal(
    deriveStageAdjustedStats(
      { atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
      { atk: -1, spa: 0, spd: 0, spe: 0 },
    ),
    null,
  );
});

test("Emerald source stage survives mapping as raw stage and derived battle view", async () => {
  const source = JSON.parse(await readFile(fixtureUrl, "utf8"));
  source.battle.opponent.stats.atk = 7;
  source.battle.opponent.statStages.atk = -1;

  const state = mapEmeraldSourceSnapshot(source);
  assert.equal(state.battle.opponent.statStages.atk, -1);
  assert.equal(state.battle.opponent.stats.atk, 7);
  assert.equal(state.battle.opponent.stageAdjustedStats.atk, 4);

  const html = renderPokemonOverlay(state);
  const attackRow = html.match(/<tr>\s*<th scope="row">Attack<\/th>[\s\S]*?<\/tr>/)?.[0];
  assert.ok(attackRow);
  assert.match(attackRow, />4/);
  assert.match(attackRow, /\(-1\)/);
  assert.match(attackRow, /base 7/);
});

test("stage-adjusted values do not replace the raw normalized stats", () => {
  const adjusted = deriveStageAdjustedStats(
    { atk: 7, def: 8, spa: 5, spd: 7, spe: 6 },
    { atk: -1, def: 0, spa: 0, spd: 0, spe: 0 },
  );
  assert.deepEqual(adjusted, { atk: 4, def: 8, spa: 5, spd: 7, spe: 6 });
});
