// Integration coverage for the real local overlay-notification delivery
// path (P04-T003): the real overlayNotificationProvider, the real
// capability-gated executor, and the real notification feed store/writer -
// no fakes standing in for any of these three. src/overlay/app.js's browser
// polling/rendering side is covered separately (test/notification-dom.test.js,
// test/notification-view.test.js) since it requires DOM access.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ACTION_EXECUTION_CODES, createActionExecutor } from "../src/actions/execute.js";
import { overlayNotificationProvider } from "../src/actions/providers/overlay-notification.js";
import { createNotificationFeed } from "../src/overlay/notification-feed.js";
import { writeNotificationFeed } from "../src/overlay/write-notification-feed.js";
import { evaluateRules } from "../src/rules/evaluate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fainted(overrides = {}) {
  return {
    type: "pokemon.fainted",
    sequence: 1,
    detectedAt: "2026-08-16T00:00:00.000Z",
    subject: { kind: "party", slot: 0 },
    previous: { currentHp: 4 },
    current: { currentHp: 0 },
    provenance: { domain: "pokemon", detector: "pokemon.fainted" },
    ...overrides,
  };
}

function faintedRule() {
  return {
    id: "notify-faint",
    enabled: true,
    eventType: "pokemon.fainted",
    predicates: [],
    actions: [{ actionType: "overlay.notification", payload: { message: "A Pokemon fainted" } }],
  };
}

function realExecutor() {
  return createActionExecutor([overlayNotificationProvider], {
    grantedCapabilities: ["overlay.notify"],
    defaultContext: { sessionAuthorized: true },
  });
}

test("a real action request, executed with a real feed-backed sink, publishes to the feed and writes the feed file", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "notification-delivery-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, "notifications.json");

  const feed = createNotificationFeed({ now: () => 1000 });
  const notify = async (message, severity) => {
    feed.publish({ message, severity });
    await writeNotificationFeed(destination, feed.list());
  };

  const executor = realExecutor();
  const [request] = evaluateRules(fainted(), [faintedRule()], { correlationId: "run:1" });
  const result = await executor.execute(request, { notify });

  assert.equal(result.status, "executed");
  assert.deepEqual(feed.list().map((entry) => ({ message: entry.message, severity: entry.severity })), [
    { message: "A Pokemon fainted", severity: "info" },
  ]);
  assert.deepEqual(JSON.parse(await readFile(destination, "utf8")).notifications.map((entry) => entry.message), [
    "A Pokemon fainted",
  ]);
});

test("a replayed/duplicate action request does not publish a second notification", async () => {
  const feed = createNotificationFeed({ now: () => 0 });
  let notifyCalls = 0;
  const notify = async (message, severity) => {
    notifyCalls += 1;
    feed.publish({ message, severity });
  };

  const executor = realExecutor();
  const [request] = evaluateRules(fainted(), [faintedRule()], { correlationId: "run:1" });

  const first = await executor.execute(request, { notify });
  const replay = await executor.execute(request, { notify });

  assert.equal(first.status, "executed");
  assert.equal(replay.status, "duplicate");
  assert.equal(replay.code, ACTION_EXECUTION_CODES.DUPLICATE);
  assert.equal(notifyCalls, 1, "the sink must be invoked exactly once for a true replay");
  assert.equal(feed.list().length, 1);
});

test("two distinct notifications preserve deterministic order in the feed", async () => {
  const feed = createNotificationFeed({ now: () => 0 });
  const notify = async (message, severity) => { feed.publish({ message, severity }); };
  const executor = realExecutor();

  const first = { ...fainted({ sequence: 1 }), subject: { kind: "party", slot: 0 } };
  const second = { ...fainted({ sequence: 2 }), subject: { kind: "party", slot: 1 } };
  const requestsA = evaluateRules(first, [faintedRule()], { correlationId: "run:1" });
  const requestsB = evaluateRules(second, [faintedRule()], { correlationId: "run:2" });

  const results = await executor.executeAll([...requestsA, ...requestsB], { notify });
  assert.deepEqual(results.map((r) => r.status), ["executed", "executed"]);
  assert.deepEqual(feed.list().map((entry) => entry.message), ["A Pokemon fainted", "A Pokemon fainted"]);
});

test("notification delivery failure becomes a structured EXECUTION_FAILED result, not a thrown/unhandled error, and does not stop batch processing", async () => {
  const feed = createNotificationFeed({ now: () => 0 });
  const notify = async (message, severity) => {
    if (message === "boom") throw new Error("simulated feed write failure");
    feed.publish({ message, severity });
  };
  const executor = realExecutor();

  const failing = evaluateRules(fainted({ sequence: 1 }), [
    { ...faintedRule(), actions: [{ actionType: "overlay.notification", payload: { message: "boom" } }] },
  ], { correlationId: "run:1" });
  const succeeding = evaluateRules(fainted({ sequence: 2 }), [faintedRule()], { correlationId: "run:2" });

  const results = await executor.executeAll([...failing, ...succeeding], { notify });
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].code, ACTION_EXECUTION_CODES.EXECUTION_FAILED);
  assert.match(results[0].details.error, /simulated feed write failure/);
  // The batch keeps going: the second, unrelated request still executes.
  assert.equal(results[1].status, "executed");
  assert.deepEqual(feed.list().map((entry) => entry.message), ["A Pokemon fainted"]);
});

test("a malformed payload fails closed as INVALID_PAYLOAD before the sink is ever called", async () => {
  let notifyCalls = 0;
  const executor = realExecutor();
  const [request] = evaluateRules(fainted(), [
    { ...faintedRule(), actions: [{ actionType: "overlay.notification", payload: { message: "" } }] },
  ], { correlationId: "run:1" });

  const result = await executor.execute(request, { notify: async () => { notifyCalls += 1; } });
  assert.equal(result.status, "rejected");
  assert.equal(result.code, ACTION_EXECUTION_CODES.INVALID_PAYLOAD);
  assert.equal(notifyCalls, 0);
});

test("a missing capability grant rejects before the sink is ever called", async () => {
  let notifyCalls = 0;
  const notify = async () => { notifyCalls += 1; };
  const [request] = evaluateRules(fainted(), [faintedRule()], { correlationId: "run:1" });

  const noCapability = createActionExecutor([overlayNotificationProvider], { grantedCapabilities: [] });
  const result = await noCapability.execute(request, { notify, sessionAuthorized: true });

  assert.equal(result.status, "rejected");
  assert.equal(result.code, ACTION_EXECUTION_CODES.MISSING_CAPABILITY);
  assert.equal(notifyCalls, 0);
});

test("an unauthorized context (capability granted, no sessionAuthorized) rejects before the sink is ever called", async () => {
  let notifyCalls = 0;
  const notify = async () => { notifyCalls += 1; };
  const [request] = evaluateRules(fainted(), [faintedRule()], { correlationId: "run:1" });

  const noAuthExecutor = createActionExecutor([overlayNotificationProvider], { grantedCapabilities: ["overlay.notify"] });
  const result = await noAuthExecutor.execute(request, { notify }); // no sessionAuthorized flag

  assert.equal(result.status, "rejected");
  assert.equal(result.code, ACTION_EXECUTION_CODES.UNAUTHORIZED_ACTION);
  assert.equal(notifyCalls, 0);
});

test("notifications cannot mutate normalized state: no notification/action-execution module imports or references Pokemon state modules", () => {
  for (const file of [
    "src/overlay/notification-feed.js",
    "src/overlay/write-notification-feed.js",
    "src/overlay/notification-view.js",
    "src/overlay/notification-dom.js",
    "src/actions/providers/overlay-notification.js",
  ]) {
    const source = readFileSync(resolve(root, file)).toString("utf8");
    assert.doesNotMatch(source, /domains[\\/]pokemon|overlay-state|emerald-state-mapping|live-state\.json/i, file);
  }
});
