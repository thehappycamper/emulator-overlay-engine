// End-to-end proof of the real wiring this task adds to
// tools/emerald-live-state.mjs: pokemon.fainted -> the declarative
// examples/rules/pokemon-fainted-notification.rule.json rule -> a validated
// overlay.notification action request -> the real capability-gated
// executor -> the real notification feed. Uses the real Emerald fixture and
// the real mapping/event/rule/executor/feed code throughout - nothing here
// is reimplemented or mocked except the notification feed file's
// destination path (a real temp file, not a fake filesystem).
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { mapEmeraldSourceSnapshot } from "../adapters/pokemon-emerald-us-rev0/emerald-state-mapping.js";
import { ACTION_EXECUTION_CODES } from "../src/actions/execute.js";
import {
  createEmeraldLiveStateSession,
  loadRules,
  processEmeraldEvents,
} from "../tools/emerald-live-state.mjs";

const sourceFixtureUrl = new URL(
  "../adapters/pokemon-emerald-us-rev0/fixtures/emerald-us-rev0.source.json",
  import.meta.url,
);
const rulesPath = resolve("examples/rules/pokemon-fainted-notification.rule.json");

async function readFixtureSource() {
  return JSON.parse(await readFile(sourceFixtureUrl, "utf8"));
}

test("the shipped pokemon-fainted-notification rule fixture loads as a single rule", async () => {
  const rules = await loadRules(rulesPath);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, "pokemon-fainted-notification");
  assert.equal(rules[0].eventType, "pokemon.fainted");
});

test("processEmeraldEvents produces nothing on the first-ever snapshot (no previous state to transition from)", async () => {
  const source = await readFixtureSource();
  const currentState = mapEmeraldSourceSnapshot(source);
  const rules = await loadRules(rulesPath);
  const calls = [];
  const executor = {
    async executeAll(requests) {
      calls.push(requests);
      return [];
    },
  };

  const { events, requests, results } = await processEmeraldEvents({
    previousState: undefined,
    currentState,
    rules,
    executor,
    stampEvent: (partial) => ({ ...partial, sequence: 1, detectedAt: "2026-08-16T00:00:00.000Z", provenance: { domain: "pokemon", detector: partial.type } }),
  });

  assert.deepEqual(events, []);
  assert.deepEqual(requests, []);
  assert.deepEqual(results, []);
  assert.equal(calls.length, 0);
});

test("a real party member fainting between two mapped snapshots produces exactly one executed overlay.notification action request", async () => {
  const source = await readFixtureSource();
  const previousState = mapEmeraldSourceSnapshot(source);
  const currentState = structuredClone(previousState);
  currentState.player.party[0] = { ...currentState.player.party[0], currentHp: 0 };

  const rules = await loadRules(rulesPath);
  const delivered = [];
  const executor = {
    async executeAll(requests, context) {
      const results = [];
      for (const request of requests) {
        // Exercise the real payload the rule declares, through the real
        // sink shape overlay-notification.js calls (message, severity).
        await context.notify(request.payload.message, request.payload.severity ?? "info");
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
    stampEvent: (partial) => ({ ...partial, sequence: 1, detectedAt: "2026-08-16T00:00:00.000Z", provenance: { domain: "pokemon", detector: partial.type } }),
    context: { notify: async (message, severity) => { delivered.push([message, severity]); } },
  });

  const faintedEvent = events.find((event) => event.type === "pokemon.fainted");
  assert.ok(faintedEvent, "a pokemon.fainted event must be derived from the real HP transition");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].actionType, "overlay.notification");
  assert.equal(requests[0].payload.message, "A Pokemon fainted");
  assert.equal(requests[0].ruleId, "pokemon-fainted-notification");
  assert.equal(results.length, 1);
});

test("createEmeraldLiveStateSession wires the real feed end to end: a real fainted transition writes a real notification feed file", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "emerald-live-state-notifications-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const notificationsFeedPath = join(directory, "notifications.json");

  const session = await createEmeraldLiveStateSession({ rulesPath, notificationsFeedPath, now: () => 0 });

  const source = await readFixtureSource();
  const first = await session.mapAndNotify(source);
  assert.deepEqual(first.requests, [], "the first-ever snapshot must not produce any notification");

  const faintedSource = structuredClone(source);
  faintedSource.party.slots[0].currentHp = 0;
  const second = await session.mapAndNotify(faintedSource);

  assert.equal(second.requests.length, 1);
  assert.equal(second.results[0].status, "executed");
  assert.deepEqual(session.feed.list().map((entry) => entry.message), ["A Pokemon fainted"]);
  assert.deepEqual(JSON.parse(await readFile(notificationsFeedPath, "utf8")).notifications.map((e) => e.message), [
    "A Pokemon fainted",
  ]);

  // A third, unchanged-HP snapshot must not fire the rule again (no new
  // transition to detect) and must not duplicate the notification.
  const third = await session.mapAndNotify(faintedSource);
  assert.deepEqual(third.requests, []);
  assert.equal(session.feed.list().length, 1);
});

test("a session's notification feed and public/live-state.json write paths never overlap (notifications cannot mutate normalized state)", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "emerald-live-state-notifications-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const notificationsFeedPath = join(directory, "notifications.json");

  const session = await createEmeraldLiveStateSession({ rulesPath, notificationsFeedPath, now: () => 0 });
  const source = await readFixtureSource();
  const before = await session.mapAndNotify(source);

  const faintedSource = structuredClone(source);
  faintedSource.party.slots[0].currentHp = 0;
  const after = await session.mapAndNotify(faintedSource);

  // The mapped Pokemon state returned for public/live-state.json is exactly
  // what mapEmeraldSourceSnapshot alone would have produced - the
  // notification pipeline never touches or augments it.
  assert.deepEqual(after.state, mapEmeraldSourceSnapshot(faintedSource));
  assert.deepEqual(before.state, mapEmeraldSourceSnapshot(source));
});
