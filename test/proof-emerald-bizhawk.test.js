import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBizHawkLaunch } from "../tools/bizhawk-proof-config.mjs";
import {
  buildSessionChildren,
  readArguments,
  runEmeraldBizHawkProofSession,
} from "../tools/proof-emerald-bizhawk.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Config loading/validation/port-checking involve real disk and socket I/O
// (libuv thread-pool round-trips), which do not resolve within a fixed
// number of microtask/setTimeout(0) ticks the way the fully-fake spawn
// path does. Polling for the expected condition is robust to that real,
// variable latency instead of guessing a tick count.
async function waitUntil(conditionFn, { timeoutMs = 2000, intervalMs = 5 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!conditionFn()) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolveFn) => setTimeout(resolveFn, intervalMs));
  }
}

function baseConfig(overrides = {}) {
  return {
    bizhawkExecutable: "C:\\Emulators\\BizHawk 2.11.1\\EmuHawk.exe",
    emeraldRom: "C:\\Games\\Pokemon Emerald.gba",
    emeraldSavestate: undefined,
    sourceSnapshot: "C:\\snapshots\\emerald.source.json",
    liveState: "C:\\out\\live-state.json",
    connectorPath: resolve(repositoryRoot, "adapters", "bizhawk", "proof-connector.lua"),
    acquisitionModule: resolve(
      repositoryRoot,
      "adapters",
      "pokemon-emerald-us-rev0",
      "emerald-acquisition.lua",
    ),
    mappingPollIntervalMs: 250,
    port: 5173,
    expectedBizHawkVersion: "2.11.1",
    expectedSystemId: "GBA",
    expectedRomHash: "F3AE088181BF583E55DAF962A92BB46F4F1D07B7",
    ...overrides,
  };
}

async function getFreePort() {
  const probe = createServer();
  await new Promise((resolveListen) => probe.listen(0, "127.0.0.1", resolveListen));
  const { port } = probe.address();
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}

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

function createFakeSpawnFn() {
  const calls = [];
  const spawnFn = (command, args, spawnOptions) => {
    const child = createFakeChild({ pid: 2000 + calls.length });
    calls.push({ command, args, options: spawnOptions, child });
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  return { spawnFn, calls };
}

test("readArguments parses --check and --config, and rejects unknown flags", () => {
  assert.deepEqual(readArguments([]).checkOnly, false);
  assert.equal(readArguments(["--check"]).checkOnly, true);
  assert.equal(readArguments(["--config", "custom.local"]).configPath, resolve("custom.local"));
  assert.throws(() => readArguments(["--bogus"]), /Unknown or incomplete argument/);
  assert.throws(() => readArguments(["--config"]), /Unknown or incomplete argument/);
});

test("buildSessionChildren reuses createBizHawkLaunch's own executable/args/environment verbatim for the bizhawk child", () => {
  const config = baseConfig();
  const launch = createBizHawkLaunch(config);
  const children = buildSessionChildren(config);
  const bizhawk = children.find((c) => c.id === "bizhawk");

  assert.equal(bizhawk.command, launch.executable);
  assert.deepEqual(bizhawk.args, launch.args);
  assert.deepEqual(bizhawk.env, launch.environment);
  assert.equal(bizhawk.ready, "spawn");
  assert.equal(bizhawk.captureOutput, false);
});

test("buildSessionChildren propagates snapshot/live-state/poll-interval/port configuration to the mapper and server, including paths containing spaces", () => {
  const config = baseConfig({
    sourceSnapshot: "C:\\Users\\Some User\\snapshots\\emerald source.json",
    liveState: "C:\\Users\\Some User\\out\\live state.json",
    mappingPollIntervalMs: 500,
    port: 6001,
  });
  const children = buildSessionChildren(config, { nodeExecutable: "C:\\Program Files\\nodejs\\node.exe" });
  const mapper = children.find((c) => c.id === "mapper");
  const server = children.find((c) => c.id === "server");

  assert.equal(mapper.command, "C:\\Program Files\\nodejs\\node.exe");
  assert.match(mapper.args[0], /emerald-live-state\.mjs$/);
  assert.equal(mapper.env.EMERALD_SOURCE_SNAPSHOT_PATH, config.sourceSnapshot);
  assert.equal(mapper.env.EOE_LIVE_STATE_PATH, config.liveState);
  assert.equal(mapper.env.EMERALD_MAPPING_POLL_INTERVAL_MS, "500");
  assert.ok(mapper.ready instanceof RegExp && mapper.ready.test("Watching Emerald source snapshot: x"));

  assert.equal(server.command, "C:\\Program Files\\nodejs\\node.exe");
  assert.match(server.args[0], /dev-server\.mjs$/);
  assert.equal(server.env.PORT, "6001");
  assert.ok(server.ready instanceof RegExp && server.ready.test("Emulator Overlay Engine running at http://127.0.0.1:6001"));
});

async function writeConfigFixture({ port, sourceSnapshot, liveState }) {
  const root = await mkdtemp(join(tmpdir(), "proof-emerald-bizhawk-"));
  const exeDir = join(root, "BizHawk 2.11.1");
  const gameDir = join(root, "games");
  await mkdir(exeDir, { recursive: true });
  await mkdir(gameDir, { recursive: true });
  await writeFile(join(exeDir, "EmuHawk.exe"), "test", "utf8");
  await writeFile(join(gameDir, "Pokemon Emerald.gba"), "test", "utf8");

  const configPath = join(root, ".env.bizhawk.local");
  const lines = [
    `EOE_BIZHAWK_EXE=${join(exeDir, "EmuHawk.exe")}`,
    `EOE_BIZHAWK_EMERALD_ROM=${join(gameDir, "Pokemon Emerald.gba")}`,
    `EMERALD_SOURCE_SNAPSHOT_PATH=${sourceSnapshot}`,
    `EOE_LIVE_STATE_PATH=${liveState}`,
    `PORT=${port}`,
  ];
  await writeFile(configPath, lines.join("\n"), "utf8");
  return { root, configPath };
}

test("--check validates the entire session and launches nothing", async (t) => {
  const port = await getFreePort();
  const root = await mkdtemp(join(tmpdir(), "proof-emerald-bizhawk-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { configPath } = await writeConfigFixture({
    port,
    sourceSnapshot: join(root, "snapshot.json"),
    liveState: join(root, "live-state.json"),
  });

  let spawnCalls = 0;
  const spawnFn = () => {
    spawnCalls += 1;
    throw new Error("spawn must never be called in --check mode");
  };

  const session = await runEmeraldBizHawkProofSession({
    argv: ["--check", "--config", configPath],
    log: () => {},
    logError: () => {},
    spawnFn,
  });

  assert.equal(session, null);
  assert.equal(spawnCalls, 0);
});

test("a port already in use fails closed before any process is spawned", async (t) => {
  const holder = createServer();
  await new Promise((resolveListen) => holder.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise((resolveClose) => holder.close(resolveClose)));
  const { port } = holder.address();

  const root = await mkdtemp(join(tmpdir(), "proof-emerald-bizhawk-portconflict-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { configPath } = await writeConfigFixture({
    port,
    sourceSnapshot: join(root, "snapshot.json"),
    liveState: join(root, "live-state.json"),
  });

  let spawnCalls = 0;
  const spawnFn = () => {
    spawnCalls += 1;
    throw new Error("spawn must never be called when the port is occupied");
  };

  await assert.rejects(
    runEmeraldBizHawkProofSession({
      argv: ["--config", configPath],
      log: () => {},
      logError: () => {},
      spawnFn,
    }),
    new RegExp(`Port ${port} is already in use`),
  );
  assert.equal(spawnCalls, 0);
});

test("a real launch spawns bizhawk, then the mapper, then the server, in that order, and reports the configured overlay URL", async (t) => {
  const port = await getFreePort();
  const root = await mkdtemp(join(tmpdir(), "proof-emerald-bizhawk-launch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { configPath } = await writeConfigFixture({
    port,
    sourceSnapshot: join(root, "snapshot.json"),
    liveState: join(root, "live-state.json"),
  });

  const { spawnFn, calls } = createFakeSpawnFn();
  const lines = [];

  const sessionPromise = runEmeraldBizHawkProofSession({
    argv: ["--config", configPath],
    log: (line) => lines.push(line),
    logError: () => {},
    spawnFn,
  });

  // bizhawk's readiness ("spawn") resolves as soon as the OS confirms the
  // process started, with nothing to hold the loop back before it moves on
  // to spawn the mapper - so the first reliably observable checkpoint is
  // "both have been spawned", in that order, not an intermediate
  // single-spawn state (which resolves and passes within the same tick).
  await waitUntil(() => calls.length >= 2);
  assert.equal(calls.length, 2);
  assert.match(calls[0].command, /EmuHawk\.exe$/, "bizhawk must spawn first");
  assert.match(calls[1].args[0], /emerald-live-state\.mjs$/, "the mapper must spawn second");

  // The mapper's readiness is a real pending regex match - the server must
  // not spawn until that fires, which is a genuinely observable pause.
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 2, "the server must not spawn before the mapper signals ready");

  calls[1].child.stdout.emit("data", "Watching Emerald source snapshot: x\n");
  await waitUntil(() => calls.length >= 3);
  assert.equal(calls.length, 3);
  assert.match(calls[2].args[0], /dev-server\.mjs$/, "the server must spawn once the mapper is ready");
  calls[2].child.stdout.emit("data", `Emulator Overlay Engine running at http://127.0.0.1:${port}\n`);

  const session = await sessionPromise;
  assert.ok(lines.some((line) => line.includes(`http://127.0.0.1:${port}/?state=/public/live-state.json`)));

  await session.terminate("test cleanup");
  for (const call of calls) {
    assert.equal(call.child.killed, true);
  }
});

test("an unexpected mapper exit after startup terminates bizhawk and the server too, leaving no orphans", async (t) => {
  const port = await getFreePort();
  const root = await mkdtemp(join(tmpdir(), "proof-emerald-bizhawk-cascade-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { configPath } = await writeConfigFixture({
    port,
    sourceSnapshot: join(root, "snapshot.json"),
    liveState: join(root, "live-state.json"),
  });

  const { spawnFn, calls } = createFakeSpawnFn();
  const sessionPromise = runEmeraldBizHawkProofSession({
    argv: ["--config", configPath],
    log: () => {},
    logError: () => {},
    spawnFn,
  });

  await waitUntil(() => calls.length >= 2);
  calls[1].child.stdout.emit("data", "Watching Emerald source snapshot: x\n");
  await waitUntil(() => calls.length >= 3);
  calls[2].child.stdout.emit("data", `Emulator Overlay Engine running at http://127.0.0.1:${port}\n`);
  const session = await sessionPromise;

  calls[1].child.emit("exit", 1, null);
  const reason = await session.waitForExit();
  assert.match(reason, /mapper exited unexpectedly/);
  assert.equal(calls[0].child.killed, true, "bizhawk must be cleaned up");
  assert.equal(calls[2].child.killed, true, "the server must be cleaned up");
});
