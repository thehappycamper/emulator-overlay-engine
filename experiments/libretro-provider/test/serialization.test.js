// Regression coverage for the request-serialization fix: real IPC against
// a koffi/native-core-free stand-in child that reproduces provider-child.mjs's
// own dispatch shape (lifecycle state machine + createSerialQueue()), so
// these tests run in any environment. "test/provider.test.js" separately
// covers real-core smoke coverage where a real Libretro core is available.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { LibretroProviderClient } from "../client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const statefulFixture = resolve(here, "..", "fixtures", "stateful-fake-child.mjs");
const unserializedFixture = resolve(here, "..", "fixtures", "unserialized-fake-child.mjs");

async function stop(childProcess) {
  if (!childProcess || childProcess.exitCode !== null) return;
  childProcess.kill();
  await Promise.race([once(childProcess, "exit"), new Promise((resolveStop) => setTimeout(resolveStop, 1000))]);
}

function newClient(fixture, overrides = {}) {
  return new LibretroProviderClient({ childPath: fixture, timeoutMs: 2000, ...overrides });
}

test("initialize immediately followed by run executes in order; run never observes NOT_INITIALIZED", async () => {
  const client = newClient(statefulFixture);
  try {
    const initializePromise = client.request("initialize", { delayMs: 40 });
    const runPromise = client.request("run");
    const [, runResult] = await Promise.all([initializePromise, runPromise]);
    assert.deepEqual(runResult, { ran: true });
  } finally {
    await client.shutdown();
    await stop(client.child);
  }
});

test("initialize -> run -> read ordering is deterministic across repeated attempts", async () => {
  // Kept small (not dozens of repetitions): each attempt spawns a real
  // child process, and this suite already runs alongside the rest of the
  // repository's tests - a couple of repetitions is enough to rule out a
  // one-off scheduling fluke without adding unnecessary process load.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const client = newClient(statefulFixture);
    try {
      const initializePromise = client.request("initialize", { delayMs: 30 });
      const runPromise = client.request("run", { delayMs: 10 });
      const readPromise = client.request("read", { index: 7 });
      const [, , readResult] = await Promise.all([initializePromise, runPromise, readPromise]);
      assert.deepEqual(readResult, { value: 7 });

      const { log: fullLog } = await client.request("inspectLog");
      const log = fullLog.filter((entry) => entry.op !== "inspectLog");
      assert.deepEqual(log.map((entry) => entry.op), ["initialize", "run", "read"]);
      for (let index = 1; index < log.length; index += 1) {
        assert.ok(
          log[index].start >= log[index - 1].end,
          `attempt ${attempt}: "${log[index].op}" started (${log[index].start}) before "${log[index - 1].op}" ended (${log[index - 1].end})`,
        );
      }
    } finally {
      await client.shutdown();
      await stop(client.child);
    }
  }
});

test("a failing request does not allow a later request to execute before it settles, and the queue stays usable afterward", async () => {
  const client = newClient(statefulFixture);
  try {
    await client.request("initialize", { delayMs: 0 });
    const failPromise = client.request("fail", { delayMs: 30 });
    const runPromise = client.request("run");
    await assert.rejects(failPromise, (error) => error.code === "SIMULATED_FAILURE");
    await assert.doesNotReject(runPromise);

    const { log } = await client.request("inspectLog");
    const failEntry = log.find((entry) => entry.op === "fail");
    const runEntry = log.filter((entry) => entry.op === "run").pop();
    assert.ok(runEntry.start >= failEntry.end, "run must not start before the failing request settled");

    // The provider must still be usable after further ordinary failures too
    // - a request-level error is never fatal to the process or the queue.
    await assert.rejects(client.request("fail"), (error) => error.code === "SIMULATED_FAILURE");
    assert.deepEqual(await client.request("run"), { ran: true });
    assert.deepEqual(await client.request("read", { index: 3 }), { value: 3 });
  } finally {
    await client.shutdown();
    await stop(client.child);
  }
});

test("shutdown waits for prior work and blocks/rejects subsequent work deterministically", async () => {
  const client = newClient(statefulFixture);
  try {
    await client.request("initialize");
    const slowRun = client.request("run", { delayMs: 50 });
    const shutdownPromise = client.request("shutdown", { delayMs: 5 });
    // A request submitted immediately after shutdown was sent must be
    // rejected deterministically, not silently dropped or left to time out.
    // The outcome is captured immediately (rather than passed straight to
    // assert.rejects later) so there is no window where it could reject
    // unobserved while this test awaits the earlier requests below.
    const rejectedAfterShutdownOutcome = client.request("run").then(
      () => ({ status: "fulfilled" }),
      (error) => ({ status: "rejected", code: error.code }),
    );

    const runResult = await slowRun;
    assert.deepEqual(runResult, { ran: true });
    await shutdownPromise;
    const outcome = await rejectedAfterShutdownOutcome;
    assert.equal(outcome.status, "rejected");
    assert.ok(
      outcome.code === "PROVIDER_SHUTTING_DOWN" || outcome.code === "CHILD_EXITED",
      `unexpected code: ${outcome.code}`,
    );
  } finally {
    await stop(client.child);
  }
});

test("multiple rapidly submitted reads execute sequentially without overlapping, and each resolves to the correct request id/value", async () => {
  const client = newClient(statefulFixture);
  try {
    await client.request("initialize");
    // A single batch covers both properties: sequential (non-overlapping)
    // execution via the delay+log inspection below, and correct parent-side
    // id correlation via each result matching the index it was requested
    // with (client.mjs assigns monotonic ids independently of this delay).
    const reads = Array.from({ length: 8 }, (_, index) => client.request("read", { index, delayMs: 5 }));
    const results = await Promise.all(reads);
    results.forEach((result, index) => assert.equal(result.value, index, `request ${index} resolved to the wrong value`));

    const { log } = await client.request("inspectLog");
    const readEntries = log.filter((entry) => entry.op === "read");
    assert.equal(readEntries.length, 8);
    for (let index = 1; index < readEntries.length; index += 1) {
      assert.ok(readEntries[index].start >= readEntries[index - 1].end, `read ${index} overlapped read ${index - 1}`);
    }
  } finally {
    await client.shutdown();
    await stop(client.child);
  }
});

test("sanity check: the unserialized pre-fix pattern actually races (proves the ordering assertions above are non-vacuous)", async () => {
  const client = newClient(unserializedFixture);
  try {
    const initializePromise = client.request("initialize", { delayMs: 60 });
    const runPromise = client.request("run");
    const outcomes = await Promise.allSettled([initializePromise, runPromise]);
    // With no serialization, `run` (near-zero delay) is expected to settle
    // while `initialize` (60ms delay) is still pending, and to observe
    // NOT_INITIALIZED. This is deliberately asserted as the CURRENT,
    // pre-fix behavior of the reference pattern - not a property this
    // repository wants going forward.
    assert.equal(outcomes[1].status, "rejected", "the unserialized pattern is expected to let run race ahead and fail");
    assert.equal(outcomes[1].reason?.code, "NOT_INITIALIZED");
  } finally {
    await stop(client.child);
  }
});

// ---------------------------------------------------------------------
// Parent-side IPC robustness (client.mjs's own stream parsing), using a
// fully in-process fake child - no real process, full control over exact
// byte-level chunking.
// ---------------------------------------------------------------------

// client.request() does `await this.start()` before writing to stdin, so
// even an already-started client's write happens one microtask tick after
// the caller's own synchronous call - `child.writes` plus `waitForWrites()`
// let tests wait for the real write to actually happen (and inspect what
// id/op it used) instead of guessing a fixed number of ticks.
function fakeChildProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr = new EventEmitter();
  child.writes = [];
  child.stdin = { write: (data) => { child.writes.push(JSON.parse(data)); } };
  child.exitCode = null;
  child.kill = () => { child.exitCode = 0; };
  return child;
}

function readyLine() { return `${JSON.stringify({ event: "ready", protocolVersion: "1.0.0" })}\n`; }

async function waitForWrites(child, count, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (child.writes.length < count) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${count} write(s); saw ${child.writes.length}`);
    await new Promise((resolveTick) => setImmediate(resolveTick));
  }
  return child.writes;
}

async function startFakeClient() {
  const child = fakeChildProcess();
  const client = new LibretroProviderClient({ timeoutMs: 500, spawnImpl: () => child });
  const startPromise = client.start();
  child.stdout.emit("data", readyLine());
  await startPromise;
  return { client, child };
}

test("IPC robustness: a response fragmented across multiple stdout chunks is still parsed correctly", async () => {
  const { client, child } = await startFakeClient();
  const requestPromise = client.request("run");
  const [{ id }] = await waitForWrites(child, 1);
  const responseLine = `${JSON.stringify({ id, ok: true, result: { ran: true } })}\n`;
  child.stdout.emit("data", responseLine.slice(0, 5));
  child.stdout.emit("data", responseLine.slice(5, 12));
  child.stdout.emit("data", responseLine.slice(12));
  assert.deepEqual(await requestPromise, { ran: true });
});

test("IPC robustness: multiple coalesced responses in one stdout chunk are both delivered", async () => {
  const { client, child } = await startFakeClient();
  const first = client.request("run");
  const second = client.request("run");
  const [writeA, writeB] = await waitForWrites(child, 2);
  const combined =
    `${JSON.stringify({ id: writeA.id, ok: true, result: { which: "first" } })}\n` +
    `${JSON.stringify({ id: writeB.id, ok: true, result: { which: "second" } })}\n`;
  child.stdout.emit("data", combined);
  assert.deepEqual(await first, { which: "first" });
  assert.deepEqual(await second, { which: "second" });
});

test("IPC robustness: an unexpected/unknown response id is ignored without disrupting real pending requests", async () => {
  const { client, child } = await startFakeClient();
  const pending = client.request("run");
  const [{ id }] = await waitForWrites(child, 1);
  const unknown = `${JSON.stringify({ id: "does-not-exist", ok: true, result: {} })}\n`;
  const real = `${JSON.stringify({ id, ok: true, result: { ran: true } })}\n`;
  child.stdout.emit("data", unknown + real);
  assert.deepEqual(await pending, { ran: true });
});

test("IPC robustness: corrupted/malformed lines in the child's output are skipped without crashing or disrupting later valid responses", async () => {
  const { client, child } = await startFakeClient();
  const pending = client.request("run");
  const [{ id }] = await waitForWrites(child, 1);
  child.stdout.emit("data", "not json at all\n");
  child.stdout.emit("data", "{ this is: also, not: valid json\n");
  child.stdout.emit("data", `${JSON.stringify({ id, ok: true, result: { ran: true } })}\n`);
  assert.deepEqual(await pending, { ran: true });
});
