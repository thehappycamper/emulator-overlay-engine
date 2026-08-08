import assert from "node:assert/strict";
import test from "node:test";
import { createLiveStateController } from "../src/overlay/live-state.js";

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
      if (!pending) {
        throw new Error("no pending tick scheduled");
      }
      const fn = pending;
      pending = null;
      await fn();
    }
  };
}

function controllerHarness(fetchImplementations, overrides = {}) {
  const scheduler = createManualScheduler();
  let callIndex = 0;
  let currentTime = 0;
  const renders = [];
  const statuses = [];

  const controller = createLiveStateController({
    fetchState: () => {
      const impl = fetchImplementations[Math.min(callIndex, fetchImplementations.length - 1)];
      callIndex += 1;
      return typeof impl === "function" ? impl() : Promise.resolve(impl);
    },
    onRender: (state) => renders.push(state),
    onStatus: (status) => statuses.push(status),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    now: () => currentTime,
    ...overrides
  });

  return {
    controller,
    scheduler,
    renders,
    statuses,
    advanceTime(ms) {
      currentTime += ms;
    },
    callCount() {
      return callIndex;
    }
  };
}

test("rejects a non-function fetchState and a non-positive interval", () => {
  assert.throws(() => createLiveStateController({ fetchState: null }), TypeError);
  assert.throws(
    () => createLiveStateController({ fetchState: () => Promise.resolve({}), intervalMs: 0 }),
    TypeError
  );
});

test("renders on the first successful fetch and reports a live status", async () => {
  const state = { hp: 100 };
  const harness = controllerHarness([state]);

  await harness.controller.start();

  assert.deepEqual(harness.renders, [state]);
  assert.equal(harness.controller.getStatus().phase, "live");
  assert.equal(harness.controller.getStatus().hasRenderedOnce, true);
  assert.equal(harness.scheduler.hasPending(), true);
});

test("renders again only when fetched state actually changes (HP update reaches the render callback)", async () => {
  const first = { hp: 100 };
  const second = { hp: 100 };
  const third = { hp: 42 };
  const harness = controllerHarness([first, second, third]);

  await harness.controller.start();
  await harness.scheduler.tick();
  await harness.scheduler.tick();

  assert.deepEqual(harness.renders, [first, third]);
  assert.equal(harness.callCount(), 3);
});

test("unchanged state polled repeatedly does not cause repeated renders or unbounded growth", async () => {
  const state = { hp: 88, party: ["Swampert", "Skarmory"] };
  const harness = controllerHarness([state, state, state, state, state]);

  await harness.controller.start();
  for (let i = 0; i < 4; i += 1) {
    await harness.scheduler.tick();
  }

  assert.equal(harness.renders.length, 1);
  assert.equal(harness.callCount(), 5);
  assert.equal(harness.controller.getStatus().phase, "live");
});

test("a transient fetch/parse failure preserves the last good state and reports stale without throwing", async () => {
  const good = { hp: 100 };
  const harness = controllerHarness([
    good,
    () => Promise.reject(new SyntaxError("Unexpected end of JSON input"))
  ]);

  await harness.controller.start();
  await harness.scheduler.tick();

  assert.deepEqual(harness.renders, [good], "no render should occur for the failed fetch");
  const status = harness.controller.getStatus();
  assert.equal(status.phase, "stale");
  assert.equal(status.lastErrorMessage, "Unexpected end of JSON input");
  assert.equal(status.hasRenderedOnce, true);
});

test("a failure before any successful fetch reports error, not stale, and never renders", async () => {
  const harness = controllerHarness([() => Promise.reject(new Error("404"))]);

  await harness.controller.start();

  assert.deepEqual(harness.renders, []);
  const status = harness.controller.getStatus();
  assert.equal(status.phase, "error");
  assert.equal(status.hasRenderedOnce, false);
});

test("recovers to live and renders again once a valid fetch follows failures", async () => {
  const good = { hp: 100 };
  const recovered = { hp: 60 };
  const harness = controllerHarness([
    good,
    () => Promise.reject(new Error("temporary read error")),
    () => Promise.reject(new Error("temporary read error")),
    recovered
  ]);

  await harness.controller.start();
  await harness.scheduler.tick();
  await harness.scheduler.tick();
  assert.equal(harness.controller.getStatus().phase, "stale");

  await harness.scheduler.tick();

  assert.deepEqual(harness.renders, [good, recovered]);
  assert.equal(harness.controller.getStatus().phase, "live");
});

test("never issues a second fetch before the previous one settles", async () => {
  let inFlight = 0;
  let maxConcurrent = 0;
  const slowFetch = async () => {
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    await Promise.resolve();
    inFlight -= 1;
    return { tick: inFlight };
  };
  const harness = controllerHarness([slowFetch, slowFetch, slowFetch]);

  await harness.controller.start();
  await harness.scheduler.tick();
  await harness.scheduler.tick();

  assert.equal(maxConcurrent, 1);
});

test("stop() prevents any further scheduled fetch", async () => {
  const state = { hp: 100 };
  const harness = controllerHarness([state, state]);

  await harness.controller.start();
  assert.equal(harness.scheduler.hasPending(), true);

  harness.controller.stop();
  assert.equal(harness.scheduler.hasPending(), false);
});

test("lastUpdatedAt reflects the injected clock on each successful poll", async () => {
  const harness = controllerHarness([{ hp: 100 }, { hp: 99 }]);
  harness.advanceTime(1000);

  await harness.controller.start();
  assert.equal(harness.controller.getStatus().lastUpdatedAt, 1000);

  harness.advanceTime(500);
  await harness.scheduler.tick();
  assert.equal(harness.controller.getStatus().lastUpdatedAt, 1500);
});
