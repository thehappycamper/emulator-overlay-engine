// Proof of the same P04 rule/action/executor path P04-T003 wired for
// pokemon.fainted, reused unmodified for the new provider-neutral
// player.party.defeated event: player.party.defeated ->
// examples/rules/player-party-defeated-notification.rule.json -> a
// validated overlay.notification action request -> the real
// capability-gated executor. Uses the real Emerald fixture and the real
// mapping/event/rule/executor code throughout - nothing here is
// reimplemented or mocked except the executor sink itself.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { mapEmeraldSourceSnapshot } from "../adapters/pokemon-emerald-us-rev0/emerald-state-mapping.js";
import { ACTION_EXECUTION_CODES } from "../src/actions/execute.js";
import { loadRules, processEmeraldEvents } from "../tools/emerald-live-state.mjs";

const sourceFixtureUrl = new URL(
  "../adapters/pokemon-emerald-us-rev0/fixtures/emerald-us-rev0.source.json",
  import.meta.url,
);
const rulesPath = resolve("examples/rules/player-party-defeated-notification.rule.json");

async function readFixtureSource() {
  return JSON.parse(await readFile(sourceFixtureUrl, "utf8"));
}

test("the shipped player-party-defeated-notification rule fixture loads as a single rule", async () => {
  const rules = await loadRules(rulesPath);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, "player-party-defeated-notification");
  assert.equal(rules[0].eventType, "player.party.defeated");
});

test("driving the real fixture's last standing party member to 0 HP produces exactly one executed overlay.notification action request", async () => {
  const source = await readFixtureSource();
  const previousState = mapEmeraldSourceSnapshot(source);
  // The real fixture's party is [31/35 HP, 0/28 HP] - slot 1 is already
  // fainted, slot 0 is the only remaining usable member. Fainting it too
  // crosses the whole-party threshold.
  assert.equal(previousState.player.party.length, 2);
  assert.equal(previousState.player.party[0].currentHp, 31);
  assert.equal(previousState.player.party[1].currentHp, 0);

  const currentState = structuredClone(previousState);
  currentState.player.party[0] = { ...currentState.player.party[0], currentHp: 0 };

  const rules = await loadRules(rulesPath);
  const delivered = [];
  const executor = {
    async executeAll(requests) {
      const results = [];
      for (const request of requests) {
        delivered.push(request.payload.message);
        results.push({ status: "executed", code: ACTION_EXECUTION_CODES.OK });
      }
      return results;
    },
  };

  const { events, requests, results } = await processEmeraldEvents({
    previousState,
    currentState,
    rules,
    executor,
    stampEvent: (partial) => ({
      ...partial,
      sequence: 1,
      detectedAt: "2026-08-17T00:00:00.000Z",
      provenance: { domain: "pokemon", detector: partial.type },
    }),
  });

  const defeatedEvent = events.find((event) => event.type === "player.party.defeated");
  assert.ok(defeatedEvent, "a player.party.defeated event must be derived from the real all-fainted transition");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].actionType, "overlay.notification");
  assert.equal(requests[0].payload.message, "Your entire party has fainted");
  assert.equal(requests[0].ruleId, "player-party-defeated-notification");
  assert.equal(results.length, 1);
  assert.deepEqual(delivered, ["Your entire party has fainted"]);
});

test("a second, unchanged all-fainted snapshot does not re-fire the rule", async () => {
  const source = await readFixtureSource();
  const previousState = mapEmeraldSourceSnapshot(source);
  const allFaintedState = structuredClone(previousState);
  allFaintedState.player.party[0] = { ...allFaintedState.player.party[0], currentHp: 0 };
  const stillAllFaintedState = structuredClone(allFaintedState);

  const rules = await loadRules(rulesPath);
  const executor = {
    async executeAll(requests) {
      return requests.map(() => ({ status: "executed", code: ACTION_EXECUTION_CODES.OK }));
    },
  };
  const stampEvent = (partial) => ({
    ...partial,
    sequence: 1,
    detectedAt: "2026-08-17T00:00:00.000Z",
    provenance: { domain: "pokemon", detector: partial.type },
  });

  const first = await processEmeraldEvents({ previousState, currentState: allFaintedState, rules, executor, stampEvent });
  assert.equal(first.requests.length, 1);

  const second = await processEmeraldEvents({
    previousState: allFaintedState,
    currentState: stillAllFaintedState,
    rules,
    executor,
    stampEvent,
  });
  assert.deepEqual(second.requests, []);
});
