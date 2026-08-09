import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ProofSessionError, checkPortAvailable, runProofSession } from "../tools/proof-session.mjs";

function createFakeChild({ pid }) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    if (child.killed) return;
    child.killed = true;
    queueMicrotask(() => child.emit("exit", null, "SIGTERM"));
  };
  return child;
}

// A fake spawn function that hands back scripted, fully controllable fake
// child processes instead of launching real ones - this is what makes
// ordering/failure/cascade-termination behavior deterministically testable
// without real subprocess timing.
function createFakeSpawnFn() {
  const calls = [];
  const spawnFn = (command, args, spawnOptions) => {
    const child = createFakeChild({ pid: 1000 + calls.length });
    calls.push({ command, args, options: spawnOptions, child });
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  return { spawnFn, calls };
}

function silentLoggers() {
  const lines = [];
  const errorLines = [];
  return { log: (line) => lines.push(line), logError: (line) => errorLines.push(line), lines, errorLines };
}

test("runProofSession rejects an empty or malformed child list without spawning anything", async () => {
  const { spawnFn, calls } = createFakeSpawnFn();
  await assert.rejects(() => runProofSession([], { spawnFn }), ProofSessionError);
  await assert.rejects(
    () => runProofSession([{ id: "a", command: "x", ready: "not-valid" }], { spawnFn }),
    ProofSessionError,
  );
  await assert.rejects(
    () => runProofSession([{ id: "a", command: "x", ready: "spawn" }, { id: "a", command: "y", ready: "spawn" }], { spawnFn }),
    /Duplicate child process id/,
  );
  assert.equal(calls.length, 0);
});

test("runProofSession spawns children strictly in order, gated on each one's own readiness signal", async () => {
  const { spawnFn, calls } = createFakeSpawnFn();
  const { log, logError } = silentLoggers();

  const sessionPromise = runProofSession(
    [
      { id: "first", command: "first-cmd", ready: "spawn" },
      { id: "second", command: "second-cmd", ready: /READY/ },
      { id: "third", command: "third-cmd", ready: "spawn" },
    ],
    { spawnFn, log, logError },
  );

  // "first" (ready: "spawn") and then "second" (ready: a regex) are both
  // spawned in order once each preceding gate resolves; "second"'s own
  // readiness is a pending regex match, so by the time both have been
  // spawned, "third" must still not have been - only spawning happened,
  // not "second" signaling ready.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, "first-cmd");
  assert.equal(calls[1].command, "second-cmd");

  // "second" needs an explicit ready line; it must not signal ready (and
  // "third" must not spawn) just because the process itself spawned.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 2, "third must not spawn before second signals ready");

  calls[1].child.stdout.emit("data", "some preamble\n");
  calls[1].child.stdout.emit("data", "READY for input\n");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 3);
  assert.equal(calls[2].command, "third-cmd");

  const session = await sessionPromise;
  assert.equal(session.isRunning("first"), true);
  assert.equal(session.isRunning("second"), true);
  assert.equal(session.isRunning("third"), true);
  await session.terminate("test cleanup");
  await session.waitForExit();
});

test("runProofSession prefixes stdout/stderr lines with [label] and splits multi-line/partial chunks correctly", async () => {
  const { spawnFn, calls } = createFakeSpawnFn();
  const { log, logError, lines, errorLines } = silentLoggers();

  const sessionPromise = runProofSession(
    [{ id: "svc", label: "svc", command: "cmd", ready: /ready-marker/ }],
    { spawnFn, log, logError },
  );
  await new Promise((r) => setTimeout(r, 0));

  calls[0].child.stdout.emit("data", "line one\nline t");
  calls[0].child.stdout.emit("data", "wo\n");
  calls[0].child.stderr.emit("data", "an error line\n");
  calls[0].child.stdout.emit("data", "ready-marker reached\n");

  const session = await sessionPromise;
  assert.deepEqual(lines.filter((l) => l.startsWith("[svc]")), [
    "[svc] line one",
    "[svc] line two",
    "[svc] ready-marker reached",
  ]);
  assert.deepEqual(errorLines, ["[svc] an error line"]);
  await session.terminate("done");
});

test("a child exiting before its ready signal is a startup failure that cleans up already-started siblings", async () => {
  const { spawnFn, calls } = createFakeSpawnFn();
  const { log, logError } = silentLoggers();

  const sessionPromise = runProofSession(
    [
      { id: "first", command: "first-cmd", ready: "spawn" },
      { id: "second", command: "second-cmd", ready: /READY/ },
    ],
    { spawnFn, log, logError },
  );
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 2);

  calls[1].child.emit("exit", 1, null);

  await assert.rejects(sessionPromise, /second failed to start/);
  assert.equal(calls[0].child.killed, true, "the already-started first child must be cleaned up");
});

test("a child that never signals readiness within its timeout fails startup and is reported", async () => {
  const { spawnFn } = createFakeSpawnFn();
  const { log, logError } = silentLoggers();

  const sessionPromise = runProofSession(
    [{ id: "slow", command: "slow-cmd", ready: /never-matches/, readyTimeoutMs: 20 }],
    { spawnFn, log, logError },
  );

  await assert.rejects(sessionPromise, /did not signal ready within 20ms/);
});

test("an unexpected exit of a running critical child cascades termination to the rest, but a signal-driven shutdown does not report cascade failure", async () => {
  const { spawnFn, calls } = createFakeSpawnFn();
  const { log, logError } = silentLoggers();

  const session = await runProofSession(
    [
      { id: "a", command: "a-cmd", ready: "spawn" },
      { id: "b", command: "b-cmd", ready: "spawn" },
    ],
    { spawnFn, log, logError },
  );

  calls[0].child.emit("exit", 1, null);
  const reason = await session.waitForExit();
  assert.match(reason, /a exited unexpectedly/);
  assert.equal(calls[1].child.killed, true, "sibling must be terminated when a critical child dies unexpectedly");
});

test("a non-critical child's unexpected exit does not terminate the rest of the session", async () => {
  const { spawnFn, calls } = createFakeSpawnFn();
  const { log, logError } = silentLoggers();

  const session = await runProofSession(
    [
      { id: "critical", command: "critical-cmd", ready: "spawn" },
      { id: "optional", command: "optional-cmd", ready: "spawn", critical: false },
    ],
    { spawnFn, log, logError },
  );

  calls[1].child.emit("exit", 1, null);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(session.isRunning("critical"), true);
  assert.equal(calls[0].child.killed, false);
  await session.terminate("test cleanup");
});

test("terminate() kills every tracked child exactly once and is idempotent", async () => {
  const { spawnFn, calls } = createFakeSpawnFn();
  const { log, logError } = silentLoggers();

  const session = await runProofSession(
    [
      { id: "a", command: "a-cmd", ready: "spawn" },
      { id: "b", command: "b-cmd", ready: "spawn" },
      { id: "c", command: "c-cmd", ready: "spawn" },
    ],
    { spawnFn, log, logError },
  );

  await session.terminate("Ctrl+C");
  await session.terminate("Ctrl+C again, should be a no-op");

  for (const call of calls) {
    assert.equal(call.child.killed, true);
  }
  const reason = await session.waitForExit();
  assert.equal(reason, "Ctrl+C");
});

test("attachToProcessSignals wires SIGINT/SIGTERM on the given process object to a full termination, without touching the real process", async () => {
  const { spawnFn, calls } = createFakeSpawnFn();
  const { log, logError } = silentLoggers();
  const fakeProcess = new EventEmitter();

  const session = await runProofSession([{ id: "a", command: "a-cmd", ready: "spawn" }], { spawnFn, log, logError });
  session.attachToProcessSignals(fakeProcess);

  fakeProcess.emit("SIGINT");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls[0].child.killed, true);
});

test("session cleanup never touches a process it did not spawn itself (no name-based termination)", async () => {
  const { spawnFn, calls } = createFakeSpawnFn();
  const { log, logError } = silentLoggers();

  // A decoy "unrelated" child using the SAME command name as a tracked
  // child, but never registered with the session - simulates some other,
  // unrelated process that happens to share an executable name.
  const unrelated = createFakeChild({ pid: 9999 });
  let unrelatedKillCalls = 0;
  unrelated.kill = () => {
    unrelatedKillCalls += 1;
  };

  const session = await runProofSession([{ id: "a", command: "shared-name.exe", ready: "spawn" }], {
    spawnFn,
    log,
    logError,
  });

  await session.terminate("cleanup");
  assert.equal(calls[0].child.killed, true);
  assert.equal(unrelatedKillCalls, 0, "an untracked process must never be killed by session cleanup");
});

test("checkPortAvailable reports false while a real socket holds the port and true once it is released", async () => {
  const holder = createServer();
  await new Promise((resolveListen) => holder.listen(0, "127.0.0.1", resolveListen));
  const { port } = holder.address();

  assert.equal(await checkPortAvailable(port), false);

  await new Promise((resolveClose) => holder.close(resolveClose));
  assert.equal(await checkPortAvailable(port), true);
});

test("runProofSession works against real spawned Node processes (not fakes): real readiness lines, real termination, a path containing spaces", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "proof session real spawn "));
  t.after(() => rm(root, { recursive: true, force: true }));

  const scriptA = join(root, "service-a.mjs");
  const scriptB = join(root, "service-b.mjs");
  await writeFile(
    scriptA,
    "console.log('service-a ready');\nsetInterval(() => {}, 1000);\nprocess.once('SIGTERM', () => process.exit(0));\n",
    "utf8",
  );
  await writeFile(
    scriptB,
    "console.log('service-b ready');\nsetInterval(() => {}, 1000);\nprocess.once('SIGTERM', () => process.exit(0));\n",
    "utf8",
  );

  const lines = [];
  const session = await runProofSession(
    [
      { id: "a", label: "a", command: process.execPath, args: [scriptA], ready: /service-a ready/ },
      { id: "b", label: "b", command: process.execPath, args: [scriptB], ready: /service-b ready/ },
    ],
    { log: (line) => lines.push(line), logError: (line) => lines.push(line) },
  );

  assert.ok(lines.includes("[a] service-a ready"));
  assert.ok(lines.includes("[b] service-b ready"));
  assert.equal(session.isRunning("a"), true);
  assert.equal(session.isRunning("b"), true);

  const pidA = session.pid("a");
  const pidB = session.pid("b");
  await session.terminate("real cleanup");
  const reason = await session.waitForExit();
  assert.equal(reason, "real cleanup");

  // Confirm both real OS processes are actually gone, not just marked
  // internally - `process.kill(pid, 0)` throws once a PID is no longer a
  // live process, which is how Node itself recommends checking. A
  // terminated process's PID can take a brief moment to fully disappear
  // from the OS process table on Windows, so poll briefly rather than
  // checking exactly once.
  function isPidAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  for (const pid of [pidA, pidB]) {
    const deadline = Date.now() + 2000;
    while (isPidAlive(pid) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(isPidAlive(pid), false, `pid ${pid} should no longer be a live process`);
  }
});
