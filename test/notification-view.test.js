import assert from "node:assert/strict";
import test from "node:test";

import { planNotificationRender } from "../src/overlay/notification-view.js";

function entry(overrides = {}) {
  return { id: "n1", message: "A Pokemon fainted", severity: "info", deliveredAt: 0, ...overrides };
}

test("a fresh feed entry not yet rendered or dismissed is planned to show", () => {
  const plan = planNotificationRender([entry()], { renderedIds: new Set(), dismissedIds: new Set() });
  assert.deepEqual(plan.toShow, [{ id: "n1", message: "A Pokemon fainted", severity: "info" }]);
  assert.deepEqual(plan.toRemove, []);
});

test("an already-rendered entry still present in the feed is not shown again (no duplicate display on repeated polls)", () => {
  const plan = planNotificationRender([entry()], { renderedIds: new Set(["n1"]), dismissedIds: new Set() });
  assert.deepEqual(plan.toShow, []);
  assert.deepEqual(plan.toRemove, []);
});

test("an entry that fell out of the feed (server-side TTL prune) is planned for removal", () => {
  const plan = planNotificationRender([], { renderedIds: new Set(["n1"]), dismissedIds: new Set() });
  assert.deepEqual(plan.toShow, []);
  assert.deepEqual(plan.toRemove, ["n1"]);
});

test("a dismissed entry is never shown again even while still present in the feed", () => {
  const plan = planNotificationRender([entry()], { renderedIds: new Set(), dismissedIds: new Set(["n1"]) });
  assert.deepEqual(plan.toShow, []);
});

test("two ordered notifications are planned to show in feed order", () => {
  const plan = planNotificationRender(
    [entry({ id: "n1", message: "first" }), entry({ id: "n2", message: "second" })],
    { renderedIds: new Set(), dismissedIds: new Set() },
  );
  assert.deepEqual(plan.toShow.map((e) => e.message), ["first", "second"]);
});

test("malformed entries (missing id/message, wrong types) are filtered out rather than throwing", () => {
  const malformed = [
    null,
    undefined,
    42,
    "string",
    {},
    { id: "n1" },
    { message: "no id" },
    { id: 5, message: "id not a string" },
    { id: "n2", message: 5 },
    { id: "n3", message: "" },
  ];
  const plan = planNotificationRender(malformed, { renderedIds: new Set(), dismissedIds: new Set() });
  assert.deepEqual(plan.toShow, []);
});

test("an unknown severity falls back to info rather than being rejected", () => {
  const plan = planNotificationRender([entry({ severity: "critical" })], { renderedIds: new Set(), dismissedIds: new Set() });
  assert.equal(plan.toShow[0].severity, "info");
});

test("a non-array feed (delivery unavailable/malformed) degrades to no-op rather than throwing", () => {
  const plan = planNotificationRender(null, { renderedIds: new Set(["n1"]), dismissedIds: new Set() });
  assert.deepEqual(plan.toShow, []);
  // Previously-rendered entries are still cleaned up even when the feed itself is malformed.
  assert.deepEqual(plan.toRemove, ["n1"]);
});

test("browser reconnect/refresh: a fresh session with empty renderedIds shows every still-active feed entry once", () => {
  const plan = planNotificationRender(
    [entry({ id: "n5", message: "still active" })],
    { renderedIds: new Set(), dismissedIds: new Set() },
  );
  assert.deepEqual(plan.toShow.map((e) => e.id), ["n5"]);
});

test("defaults to empty renderedIds/dismissedIds when options are omitted", () => {
  const plan = planNotificationRender([entry()]);
  assert.deepEqual(plan.toShow.map((e) => e.id), ["n1"]);
});
