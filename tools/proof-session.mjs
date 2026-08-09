// Reusable, emulator-agnostic child-process lifecycle orchestration for a
// local "proof session" (emulator/provider + mapper + dev server, or any
// similar fixed set of long-running local processes). Contains no
// Pokemon/Emerald/BizHawk/mGBA-specific knowledge - callers build the child
// process specifications and pass them in.
//
// Windows note: unlike POSIX, a non-detached Node child process is NOT
// automatically terminated when its parent process exits, and there is no
// real SIGTERM/SIGKILL distinction - `ChildProcess#kill()` maps to
// `TerminateProcess()` on Windows, which is already immediate/forceful (see
// Node's own child_process documentation). Every child this module spawns
// is therefore explicitly tracked by its own `ChildProcess` object and
// terminated by calling `.kill()` on that exact object (which operates by
// PID, not by executable name) during shutdown - never by an
// image-name-based kill (e.g. `taskkill /IM`), which would risk terminating
// unrelated processes that happen to share an executable name.

import { spawn as defaultSpawn } from "node:child_process";
import { createServer } from "node:net";

export class ProofSessionError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ProofSessionError";
  }
}

const DEFAULT_READY_TIMEOUT_MS = 10_000;

function validateChildren(children) {
  if (!Array.isArray(children) || children.length === 0) {
    throw new ProofSessionError("A proof session requires at least one child process specification");
  }
  const seenIds = new Set();
  for (const spec of children) {
    if (!spec?.id || typeof spec.id !== "string") {
      throw new ProofSessionError("Every child process specification requires a string `id`");
    }
    if (seenIds.has(spec.id)) {
      throw new ProofSessionError(`Duplicate child process id: ${spec.id}`);
    }
    seenIds.add(spec.id);
    if (!spec.command || typeof spec.command !== "string") {
      throw new ProofSessionError(`Child "${spec.id}" requires a string \`command\``);
    }
    if (spec.ready !== "spawn" && !(spec.ready instanceof RegExp) && typeof spec.ready !== "function") {
      throw new ProofSessionError(`Child "${spec.id}" \`ready\` must be "spawn", a RegExp, or a function`);
    }
  }
}

function matchesReady(ready, line) {
  if (ready instanceof RegExp) return ready.test(line);
  if (typeof ready === "function") return Boolean(ready(line));
  return false;
}

// Splits a stream into complete lines (handling chunks that split mid-line
// and a final unterminated line at stream end), invoking `onLine` for each.
function pipeLines(stream, onLine) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      onLine(line);
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) onLine(buffer);
  });
}

// Checks whether `port` can currently be bound on `host` by binding a
// throwaway probe socket and immediately closing it - a real, deterministic
// check against actual OS socket state, not a guess or a fixed port list.
export function checkPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolvePromise) => {
    const probe = createServer();
    probe.once("error", () => resolvePromise(false));
    probe.once("listening", () => {
      probe.close(() => resolvePromise(true));
    });
    probe.listen(port, host);
  });
}

// Runs a fixed set of child processes in the given order, each gated on its
// own readiness signal before the next is spawned. Returns once every child
// has signaled ready (or throws and cleans up if any fails to start).
//
// Each child spec:
//   id             string, unique within this session
//   label          string, used as the "[label]" log prefix (defaults to id)
//   command/args   passed directly to the spawn function
//   env/cwd        passed directly to the spawn function
//   ready          "spawn" (ready as soon as the OS confirms the process
//                  started - the only signal available for processes with
//                  no meaningful startup output, e.g. a GUI emulator) |
//                  RegExp (ready when a stdout/stderr line matches) |
//                  function(line) => boolean
//   readyTimeoutMs how long to wait for a RegExp/function ready signal
//                  before treating startup as failed (default 10s)
//   captureOutput  false to leave stdio fully ignored (e.g. a GUI
//                  application with no meaningful stdout of its own);
//                  defaults to true
//   critical       false to exclude this child from cascade-termination
//                  when it exits unexpectedly after the session is up;
//                  defaults to true (every child matters by default)
export async function runProofSession(children, options = {}) {
  const {
    spawnFn = defaultSpawn,
    log = (line) => console.log(line),
    logError = (line) => console.error(line),
    defaultReadyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
  } = options;

  validateChildren(children);

  const tracked = new Map();
  let shuttingDown = false;
  let terminationReason = null;
  let exitResolvers = [];

  function allExited() {
    return tracked.size > 0 && [...tracked.values()].every((entry) => entry.exited);
  }

  function resolveExitWaitersIfDone() {
    if (allExited()) {
      const resolvers = exitResolvers;
      exitResolvers = [];
      for (const resolveFn of resolvers) resolveFn(terminationReason);
    }
  }

  async function terminate(reason) {
    if (shuttingDown) return;
    shuttingDown = true;
    terminationReason = reason;
    log(`Stopping proof session: ${reason}`);
    // Reverse spawn order is an arbitrary, deterministic default - nothing
    // in this module depends on shutdown order once every child is up.
    for (const id of [...tracked.keys()].reverse()) {
      const entry = tracked.get(id);
      if (entry.exited) continue;
      try {
        entry.child.kill();
      } catch (error) {
        logError(`[${entry.spec.label}] failed to terminate: ${error.message}`);
      }
    }
    resolveExitWaitersIfDone();
  }

  function spawnAndAwaitReady(spec) {
    const label = spec.label ?? spec.id;
    const captureOutput = spec.captureOutput !== false;
    const child = spawnFn(spec.command, spec.args ?? [], {
      cwd: spec.cwd,
      env: spec.env,
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "ignore",
      windowsHide: false,
    });

    const entry = { child, spec: { ...spec, label }, exited: false, exitInfo: null };
    tracked.set(spec.id, entry);

    let onReadyLine = () => {};

    if (captureOutput && child.stdout) {
      pipeLines(child.stdout, (line) => {
        log(`[${label}] ${line}`);
        onReadyLine(line);
      });
    }
    if (captureOutput && child.stderr) {
      pipeLines(child.stderr, (line) => {
        logError(`[${label}] ${line}`);
        onReadyLine(line);
      });
    }

    child.on("exit", (code, signal) => {
      entry.exited = true;
      entry.exitInfo = { code, signal };
      if (!shuttingDown) {
        if (spec.critical === false) {
          log(`[${label}] exited (code ${code ?? "null"}, signal ${signal ?? "null"}); not critical, session continues`);
        } else {
          terminate(`${label} exited unexpectedly (code ${code ?? "null"}, signal ${signal ?? "null"})`);
        }
      }
      resolveExitWaitersIfDone();
    });

    return new Promise((resolveReady, rejectReady) => {
      let settled = false;
      let timeoutHandle;

      const settleReady = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        resolveReady();
      };
      const settleFailure = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        rejectReady(error);
      };

      child.once("error", settleFailure);
      child.once("exit", (code, signal) => {
        settleFailure(new Error(`exited before signaling ready (code ${code ?? "null"}, signal ${signal ?? "null"})`));
      });

      if (spec.ready === "spawn") {
        child.once("spawn", settleReady);
      } else {
        onReadyLine = (line) => {
          if (matchesReady(spec.ready, line)) settleReady();
        };
        const timeoutMs = spec.readyTimeoutMs ?? defaultReadyTimeoutMs;
        timeoutHandle = setTimeout(() => {
          settleFailure(new Error(`did not signal ready within ${timeoutMs}ms`));
        }, timeoutMs);
      }
    });
  }

  for (const spec of children) {
    try {
      await spawnAndAwaitReady(spec);
    } catch (error) {
      await terminate(`${spec.label ?? spec.id} failed to start`);
      throw new ProofSessionError(`${spec.label ?? spec.id} failed to start: ${error.message}`, { cause: error });
    }
  }

  return {
    terminate,
    waitForExit() {
      return new Promise((resolveFn) => {
        if (allExited()) resolveFn(terminationReason);
        else exitResolvers.push(resolveFn);
      });
    },
    attachToProcessSignals(targetProcess = process) {
      const handleSignal = (signal) => {
        terminate(`received ${signal}`);
      };
      targetProcess.on("SIGINT", () => handleSignal("SIGINT"));
      targetProcess.on("SIGTERM", () => handleSignal("SIGTERM"));
    },
    isRunning(id) {
      return tracked.has(id) && !tracked.get(id).exited;
    },
    pid(id) {
      return tracked.get(id)?.child.pid;
    },
  };
}
