import assert from "node:assert/strict";
import test from "node:test";

import { NotificationFeedError, createNotificationFeed } from "../src/overlay/notification-feed.js";

test("publish() assigns a stable, ordered id and returns a frozen entry", () => {
  const feed = createNotificationFeed({ now: () => 1000 });
  const entry = feed.publish({ message: "A Pokemon fainted" });
  assert.equal(entry.id, "n1");
  assert.equal(entry.message, "A Pokemon fainted");
  assert.equal(entry.severity, "info");
  assert.equal(entry.deliveredAt, 1000);
  assert.throws(() => { entry.message = "mutated"; });
});

test("severity defaults to info and accepts warn/error", () => {
  const feed = createNotificationFeed({ now: () => 0 });
  assert.equal(feed.publish({ message: "a" }).severity, "info");
  assert.equal(feed.publish({ message: "b", severity: "warn" }).severity, "warn");
  assert.equal(feed.publish({ message: "c", severity: "error" }).severity, "error");
});

test("list() preserves publish order (oldest first)", () => {
  const feed = createNotificationFeed({ now: () => 0 });
  feed.publish({ message: "first" });
  feed.publish({ message: "second" });
  feed.publish({ message: "third" });
  assert.deepEqual(feed.list().map((entry) => entry.message), ["first", "second", "third"]);
});

test("expired entries are pruned by a fixed deliveredAt+ttlMs lifetime, not a countdown", () => {
  let now = 0;
  const feed = createNotificationFeed({ ttlMs: 1000, now: () => now });
  feed.publish({ message: "old" });
  now = 500;
  feed.publish({ message: "new" });

  now = 1400; // "old" (deliveredAt 0) has now exceeded its 1000ms ttl; "new" (deliveredAt 500) has not
  const list = feed.list();
  assert.deepEqual(list.map((entry) => entry.message), ["new"]);
});

test("maxEntries bounds the feed, dropping the oldest entries first", () => {
  const feed = createNotificationFeed({ maxEntries: 2, now: () => 0 });
  feed.publish({ message: "a" });
  feed.publish({ message: "b" });
  feed.publish({ message: "c" });
  assert.deepEqual(feed.list().map((entry) => entry.message), ["b", "c"]);
});

test("clear() empties the feed", () => {
  const feed = createNotificationFeed({ now: () => 0 });
  feed.publish({ message: "a" });
  feed.clear();
  assert.deepEqual(feed.list(), []);
});

test("publish() fails closed on a malformed message or severity", () => {
  const feed = createNotificationFeed({ now: () => 0 });
  assert.throws(() => feed.publish({ message: "" }), NotificationFeedError);
  assert.throws(() => feed.publish({ message: "   " }), NotificationFeedError);
  assert.throws(() => feed.publish({ message: 42 }), NotificationFeedError);
  assert.throws(() => feed.publish({}), NotificationFeedError);
  assert.throws(() => feed.publish({ message: "ok", severity: "critical" }), NotificationFeedError);
  // A rejected publish must not corrupt the feed - list() stays unaffected.
  assert.deepEqual(feed.list(), []);
});

test("createNotificationFeed validates its own construction options", () => {
  assert.throws(() => createNotificationFeed({ ttlMs: 0 }), TypeError);
  assert.throws(() => createNotificationFeed({ ttlMs: -1 }), TypeError);
  assert.throws(() => createNotificationFeed({ maxEntries: 0 }), TypeError);
  assert.throws(() => createNotificationFeed({ maxEntries: 1.5 }), TypeError);
  assert.throws(() => createNotificationFeed({ now: "not-a-function" }), TypeError);
});

test("list() returns a fresh array each call, not the live internal reference", () => {
  const feed = createNotificationFeed({ now: () => 0 });
  feed.publish({ message: "a" });
  const first = feed.list();
  first.push({ id: "fake", message: "injected", severity: "info", deliveredAt: 0 });
  assert.equal(feed.list().length, 1);
});
