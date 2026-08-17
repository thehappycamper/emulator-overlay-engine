import assert from "node:assert/strict";
import test from "node:test";

import { buildNotificationNode, createNotificationPanel } from "../src/overlay/notification-dom.js";

function createFakeElement(tag) {
  return {
    tagName: tag,
    className: "",
    // Deliberately left undefined and never written to by
    // buildNotificationNode/createNotificationPanel - a test asserts this
    // stays undefined, proving no markup string is ever assigned to it.
    innerHTML: undefined,
    textContent: "",
    attributes: {},
    listeners: {},
    children: [],
    removed: false,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(event, handler) {
      this.listeners[event] = handler;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {
      this.removed = true;
    },
  };
}

function createFakeContainer() {
  const container = createFakeElement("div");
  return container;
}

function createManualScheduler() {
  let pending = null;
  return {
    schedule(fn) {
      pending = fn;
      return {};
    },
    cancel() {
      pending = null;
    },
    hasPending() {
      return pending !== null;
    },
    async tick() {
      if (!pending) throw new Error("no pending tick scheduled");
      const fn = pending;
      pending = null;
      await fn();
    },
  };
}

test("buildNotificationNode renders message/severity via textContent only, never innerHTML - safe against HTML/script injection", () => {
  const malicious = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const dismissed = [];
  const node = buildNotificationNode(
    { id: "n1", message: malicious, severity: "error" },
    { createElement: createFakeElement, onDismiss: (id) => dismissed.push(id) },
  );

  assert.equal(node.className, "notification notification-error");
  assert.equal(node.innerHTML, undefined, "innerHTML must never be written");

  const [severityEl, messageEl, dismissEl] = node.children;
  assert.equal(severityEl.textContent, "Error");
  assert.equal(severityEl.innerHTML, undefined);
  // The raw, unmodified string lands in textContent - proving it was never
  // parsed as markup and never escaped-then-interpolated into innerHTML.
  assert.equal(messageEl.textContent, malicious);
  assert.equal(messageEl.innerHTML, undefined);

  dismissEl.listeners.click();
  assert.deepEqual(dismissed, ["n1"]);
});

test("buildNotificationNode falls back to the Info label for an unrecognized severity", () => {
  const node = buildNotificationNode({ id: "n1", message: "hi", severity: "bogus" }, { createElement: createFakeElement });
  assert.equal(node.children[0].textContent, "Info");
});

test("createNotificationPanel requires a container and a fetchNotifications function", () => {
  assert.throws(() => createNotificationPanel({ fetchNotifications: () => {} }), TypeError);
  assert.throws(() => createNotificationPanel({ container: createFakeContainer() }), TypeError);
});

test("a new notification is appended once; an unchanged poll does not duplicate it; an expired one is removed", async () => {
  const scheduler = createManualScheduler();
  const container = createFakeContainer();
  let feed = [{ id: "n1", message: "A Pokemon fainted", severity: "info" }];

  const panel = createNotificationPanel({
    container,
    fetchNotifications: () => Promise.resolve({ notifications: feed }),
    createElement: createFakeElement,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    now: () => 0,
  });

  await panel.start();
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].children[1].textContent, "A Pokemon fainted");

  // Unchanged feed: createLiveStateController's own change-detection means
  // onRender is not even invoked again, so nothing new is appended.
  await scheduler.tick();
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].removed, false);

  // A second, distinct notification arrives alongside the first (feed
  // content genuinely changes) - only the new one is appended, in order;
  // the first is not duplicated.
  feed = [
    { id: "n1", message: "A Pokemon fainted", severity: "info" },
    { id: "n2", message: "Badge earned", severity: "info" },
  ];
  await scheduler.tick();
  assert.equal(container.children.length, 2);
  assert.equal(container.children[1].children[1].textContent, "Badge earned");
  assert.equal(container.children[0].removed, false, "the first notification must not be re-created or removed");

  // n1 falls out of the feed (server-side TTL prune) - its node is removed;
  // n2 remains untouched.
  feed = [{ id: "n2", message: "Badge earned", severity: "info" }];
  await scheduler.tick();
  assert.equal(container.children[0].removed, true);
  assert.equal(container.children[1].removed, false);
});

test("dismissing a notification removes it and it is never re-shown even if the feed still contains it", async () => {
  const scheduler = createManualScheduler();
  const container = createFakeContainer();
  const feed = [{ id: "n1", message: "A Pokemon fainted", severity: "info" }];

  const panel = createNotificationPanel({
    container,
    fetchNotifications: () => Promise.resolve({ notifications: feed }),
    createElement: createFakeElement,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    now: () => 0,
  });

  await panel.start();
  const node = container.children[0];
  node.children[2].listeners.click(); // click the dismiss button
  assert.equal(node.removed, true);

  // The feed is unchanged (n1 still "active" server-side) but the poll
  // result differs enough to trigger onRender again via a severity change,
  // simulating a later poll; n1 must still not reappear because it was
  // explicitly dismissed.
  feed[0] = { ...feed[0], severity: "warn" };
  await scheduler.tick();
  assert.equal(container.children.length, 1, "a dismissed notification must never be re-created");
});

test("browser reconnect: a fresh panel instance shows a still-active notification once, from a clean renderedIds/dismissedIds state", async () => {
  const scheduler = createManualScheduler();
  const container = createFakeContainer();
  const feed = [{ id: "n7", message: "Still active on reconnect", severity: "info" }];

  const panel = createNotificationPanel({
    container,
    fetchNotifications: () => Promise.resolve({ notifications: feed }),
    createElement: createFakeElement,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    now: () => 0,
  });

  await panel.start();
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].children[1].textContent, "Still active on reconnect");
});

test("a fetchNotifications failure does not crash the panel and no notification is rendered for that poll", async () => {
  const scheduler = createManualScheduler();
  const container = createFakeContainer();

  const panel = createNotificationPanel({
    container,
    fetchNotifications: () => Promise.reject(new Error("network down")),
    createElement: createFakeElement,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    now: () => 0,
  });

  await assert.doesNotReject(() => panel.start());
  assert.equal(container.children.length, 0);
  assert.equal(panel.getStatus().phase, "error");
});

test("a malformed feed payload (non-array notifications) degrades to no-op instead of throwing", async () => {
  const scheduler = createManualScheduler();
  const container = createFakeContainer();

  const panel = createNotificationPanel({
    container,
    fetchNotifications: () => Promise.resolve({ notifications: "not-an-array" }),
    createElement: createFakeElement,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    now: () => 0,
  });

  await assert.doesNotReject(() => panel.start());
  assert.equal(container.children.length, 0);
});
