// Transactional-publication regression coverage for the P04-T003 fix round
// (see ADR 0029's addendum and docs/tasks/P04/P04-T003.md): a notification
// action must be atomic from the action executor's perspective -
// createNotificationDelivery's real notify() sink must never leave the
// in-memory feed mutated when the durable write fails, and a retry after a
// failure must publish exactly one notification, not two.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createNotificationFeed } from "../src/overlay/notification-feed.js";
import { createNotificationDelivery } from "../tools/emerald-live-state.mjs";

function flakyFileSystem(failFirstNCalls) {
  let calls = 0;
  return {
    mkdir,
    open,
    rm,
    async rename(source, target) {
      calls += 1;
      if (calls <= failFirstNCalls) {
        throw new Error(`simulated write failure #${calls}`);
      }
      return rename(source, target);
    },
  };
}

async function readFeedFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

test("a failed publication leaves the in-memory feed and the persisted file completely unchanged, and the attempt rejects", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "notification-atomicity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const notificationsFeedPath = join(directory, "notifications.json");

  const feed = createNotificationFeed({ now: () => 0 });
  const notify = createNotificationDelivery({ feed, notificationsFeedPath, fileSystem: flakyFileSystem(1) });

  await assert.rejects(() => notify("A", "info"), /simulated write failure/);

  assert.deepEqual(feed.list(), [], "the in-memory feed must remain empty after a failed publish attempt");
  assert.equal(await readFeedFile(notificationsFeedPath), null, "no file should exist after a failed first-ever write");
});

test("retrying the same notification after a failure succeeds and publishes exactly one notification, not two", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "notification-atomicity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const notificationsFeedPath = join(directory, "notifications.json");

  const feed = createNotificationFeed({ now: () => 0 });
  const notify = createNotificationDelivery({ feed, notificationsFeedPath, fileSystem: flakyFileSystem(1) });

  await assert.rejects(() => notify("A", "info"));
  await notify("A", "info"); // retry of the same logical action

  assert.deepEqual(feed.list().map((entry) => entry.message), ["A"]);
  const persisted = await readFeedFile(notificationsFeedPath);
  assert.deepEqual(persisted.notifications.map((entry) => entry.message), ["A"]);
});

test("an existing feed entry survives a failed publication attempt untouched, and a successful retry appends after it", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "notification-atomicity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const notificationsFeedPath = join(directory, "notifications.json");

  const feed = createNotificationFeed({ now: () => 0 });
  await createNotificationDelivery({ feed, notificationsFeedPath })("X", "info"); // establish existing feed = [X]

  const flakyNotify = createNotificationDelivery({ feed, notificationsFeedPath, fileSystem: flakyFileSystem(1) });
  await assert.rejects(() => flakyNotify("A", "info"));
  assert.deepEqual(
    feed.list().map((entry) => entry.message),
    ["X"],
    "the pre-existing entry must remain, and the failed attempt must add nothing",
  );
  assert.deepEqual((await readFeedFile(notificationsFeedPath)).notifications.map((entry) => entry.message), ["X"]);

  await flakyNotify("A", "info");
  assert.deepEqual(feed.list().map((entry) => entry.message), ["X", "A"]);
  assert.deepEqual((await readFeedFile(notificationsFeedPath)).notifications.map((entry) => entry.message), ["X", "A"]);
});

test("two successful sequential notifications preserve deterministic order", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "notification-atomicity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const notificationsFeedPath = join(directory, "notifications.json");

  const feed = createNotificationFeed({ now: () => 0 });
  const notify = createNotificationDelivery({ feed, notificationsFeedPath });

  await notify("first", "info");
  await notify("second", "warn");

  assert.deepEqual(feed.list().map((entry) => entry.message), ["first", "second"]);
  assert.deepEqual(
    (await readFeedFile(notificationsFeedPath)).notifications.map((entry) => entry.message),
    ["first", "second"],
  );
});

test("concurrent notify() calls are serialized: both eventually commit, in call order, without one clobbering the other", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "notification-atomicity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const notificationsFeedPath = join(directory, "notifications.json");

  const feed = createNotificationFeed({ now: () => 0 });
  let delayNextRename = true;
  const fileSystem = {
    mkdir,
    open,
    rm,
    async rename(source, target) {
      if (delayNextRename) {
        delayNextRename = false;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return rename(source, target);
    },
  };
  const notify = createNotificationDelivery({ feed, notificationsFeedPath, fileSystem });

  const [a, b] = await Promise.allSettled([notify("A", "info"), notify("B", "info")]);
  assert.equal(a.status, "fulfilled");
  assert.equal(b.status, "fulfilled");
  assert.deepEqual(feed.list().map((entry) => entry.message), ["A", "B"]);
  assert.deepEqual(
    (await readFeedFile(notificationsFeedPath)).notifications.map((entry) => entry.message),
    ["A", "B"],
  );
});

test("TTL pruning and maxEntries bounds remain correct through prepare()/commit()", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "notification-atomicity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const notificationsFeedPath = join(directory, "notifications.json");

  let now = 0;
  const feed = createNotificationFeed({ ttlMs: 1000, maxEntries: 2, now: () => now });
  const notify = createNotificationDelivery({ feed, notificationsFeedPath });

  await notify("a", "info");
  now = 500;
  await notify("b", "info");
  now = 1400; // "a" (deliveredAt 0) has exceeded its 1000ms ttl; "b" (deliveredAt 500) has not
  assert.deepEqual(feed.list().map((entry) => entry.message), ["b"]);

  now = 1500;
  await notify("c", "info");
  await notify("d", "info");
  // maxEntries: 2 caps the feed regardless of TTL.
  assert.deepEqual(feed.list().map((entry) => entry.message), ["c", "d"]);
});

test("a replayed successful action still does not republish (executor-level replay guard, unaffected by this fix)", async () => {
  const { createActionExecutor } = await import("../src/actions/execute.js");
  const { overlayNotificationProvider } = await import("../src/actions/providers/overlay-notification.js");
  const { evaluateRules } = await import("../src/rules/evaluate.js");

  const feed = createNotificationFeed({ now: () => 0 });
  let calls = 0;
  const notify = async (message, severity) => { calls += 1; feed.publish({ message, severity }); };

  const executor = createActionExecutor([overlayNotificationProvider], {
    grantedCapabilities: ["overlay.notify"],
    defaultContext: { sessionAuthorized: true },
  });
  const event = {
    type: "pokemon.fainted",
    sequence: 1,
    detectedAt: "2026-08-16T00:00:00.000Z",
    subject: { kind: "party", slot: 0 },
    previous: { currentHp: 4 },
    current: { currentHp: 0 },
    provenance: { domain: "pokemon", detector: "pokemon.fainted" },
  };
  const rule = {
    id: "notify-faint",
    enabled: true,
    eventType: "pokemon.fainted",
    predicates: [],
    actions: [{ actionType: "overlay.notification", payload: { message: "A Pokemon fainted" } }],
  };
  const [request] = evaluateRules(event, [rule], { correlationId: "run:1" });

  const first = await executor.execute(request, { notify });
  const replay = await executor.execute(request, { notify });
  assert.equal(first.status, "executed");
  assert.equal(replay.status, "duplicate");
  assert.equal(calls, 1);
  assert.equal(feed.list().length, 1);
});

test("a malformed payload still never reaches publication", async () => {
  const { createActionExecutor, ACTION_EXECUTION_CODES } = await import("../src/actions/execute.js");
  const { overlayNotificationProvider } = await import("../src/actions/providers/overlay-notification.js");
  const { evaluateRules } = await import("../src/rules/evaluate.js");

  let calls = 0;
  const notify = async () => { calls += 1; };
  const executor = createActionExecutor([overlayNotificationProvider], {
    grantedCapabilities: ["overlay.notify"],
    defaultContext: { sessionAuthorized: true },
  });
  const event = {
    type: "pokemon.fainted",
    sequence: 1,
    detectedAt: "2026-08-16T00:00:00.000Z",
    subject: null,
    previous: null,
    current: null,
    provenance: { domain: "pokemon", detector: "pokemon.fainted" },
  };
  const rule = {
    id: "notify-faint",
    enabled: true,
    eventType: "pokemon.fainted",
    predicates: [],
    actions: [{ actionType: "overlay.notification", payload: { message: "not-empty-so-rule-eval-passes" } }],
  };
  const [request] = evaluateRules(event, [rule], { correlationId: "run:1" });
  const malformed = { ...request, payload: { message: "" } };

  const result = await executor.execute(malformed, { notify });
  assert.equal(result.status, "rejected");
  assert.equal(result.code, ACTION_EXECUTION_CODES.INVALID_PAYLOAD);
  assert.equal(calls, 0);
});

test("capability/authorization failures never touch the feed", async () => {
  const { createActionExecutor, ACTION_EXECUTION_CODES } = await import("../src/actions/execute.js");
  const { overlayNotificationProvider } = await import("../src/actions/providers/overlay-notification.js");
  const { evaluateRules } = await import("../src/rules/evaluate.js");

  const feed = createNotificationFeed({ now: () => 0 });
  const notify = async (message, severity) => { feed.publish({ message, severity }); };
  const event = {
    type: "pokemon.fainted",
    sequence: 1,
    detectedAt: "2026-08-16T00:00:00.000Z",
    subject: { kind: "party", slot: 0 },
    previous: { currentHp: 4 },
    current: { currentHp: 0 },
    provenance: { domain: "pokemon", detector: "pokemon.fainted" },
  };
  const rule = {
    id: "notify-faint",
    enabled: true,
    eventType: "pokemon.fainted",
    predicates: [],
    actions: [{ actionType: "overlay.notification", payload: { message: "A Pokemon fainted" } }],
  };
  const [request] = evaluateRules(event, [rule], { correlationId: "run:1" });

  const noCapability = createActionExecutor([overlayNotificationProvider], { grantedCapabilities: [] });
  const missingCapability = await noCapability.execute(request, { notify, sessionAuthorized: true });
  assert.equal(missingCapability.code, ACTION_EXECUTION_CODES.MISSING_CAPABILITY);

  const noAuth = createActionExecutor([overlayNotificationProvider], { grantedCapabilities: ["overlay.notify"] });
  const unauthorized = await noAuth.execute(request, { notify });
  assert.equal(unauthorized.code, ACTION_EXECUTION_CODES.UNAUTHORIZED_ACTION);

  assert.deepEqual(feed.list(), []);
});

test("createNotificationDelivery requires a feed with prepare()/commit() and a notificationsFeedPath", () => {
  assert.throws(() => createNotificationDelivery({}), TypeError);
  assert.throws(() => createNotificationDelivery({ feed: { publish() {} } }), TypeError);
  assert.throws(
    () => createNotificationDelivery({ feed: createNotificationFeed(), notificationsFeedPath: "" }),
    TypeError,
  );
});
