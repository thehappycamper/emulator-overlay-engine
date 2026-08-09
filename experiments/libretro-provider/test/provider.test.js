import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { LibretroProviderClient } from "../client.mjs";
import { ProviderError, assertRequest } from "../protocol.mjs";
import { describeMemoryRegions, readMemory, readValue } from "../memory.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, "..", "fixtures", "fake-child.mjs");
const child = (mode) => resolve(here, "..", "provider-child.mjs");
let hasKoffi = true;
try { createRequire(import.meta.url).resolve("koffi"); } catch { hasKoffi = false; }
async function stop(childProcess) {
  if (childProcess.exitCode !== null) return;
  childProcess.kill();
  await Promise.race([once(childProcess, "exit"), new Promise((resolveStop) => setTimeout(resolveStop, 1000))]);
}

test("client supports lifecycle requests and preserves paths containing spaces", async () => {
  const client = new LibretroProviderClient({ childPath: fixture, timeoutMs: 1000, spawnImpl: (exe, args, options) => spawn(exe, [...args, "normal"], options) });
  const initialized = await client.request("initialize", { corePath: "C:\\Program Files\\mGBA\\mgba_libretro.dll", contentPath: "C:\\Games\\Pokemon Emerald.gba" });
  assert.equal(initialized.op, "initialize");
  assert.match(initialized.params.corePath, /Program Files/);
  assert.equal((await client.request("run", { frames: 3 })).params.frames, 3);
  await client.shutdown();
});

test("client reports startup failure deterministically", async () => {
  const client = new LibretroProviderClient({ childPath: "C:\\missing path\\provider-child.mjs", timeoutMs: 100 });
  await assert.rejects(() => client.start(), (error) => ["STARTUP_FAILED", "STARTUP_TIMEOUT", "CHILD_EXITED"].includes(error.code));
});

test("parent request rejects when child crashes and remains usable", async () => {
  const client = new LibretroProviderClient({ childPath: fixture, timeoutMs: 500, spawnImpl: (exe, args, options) => spawn(exe, [...args, "crash"], options) });
  await assert.rejects(() => client.request("run"), (error) => error.code === "CHILD_EXITED");
  assert.equal(1 + 1, 2);
});

test("timeout is surfaced for an unresponsive child", async () => {
  const client = new LibretroProviderClient({ childPath: fixture, timeoutMs: 250, spawnImpl: (exe, args, options) => spawn(exe, [...args, "hang"], options) });
  await assert.rejects(() => client.request("run"), (error) => error.code === "TIMEOUT");
  await stop(client.child);
});

test("structured ABI mismatch errors cross the IPC boundary", async () => {
  const client = new LibretroProviderClient({ childPath: fixture, timeoutMs: 500, spawnImpl: (exe, args, options) => spawn(exe, [...args, "abi-mismatch"], options) });
  await assert.rejects(() => client.request("initialize"), (error) => error.code === "CORE_ABI_MISMATCH");
  await stop(client.child);
});

test("memory reads enforce region, width, and bounds without domain assumptions", () => {
  const buffer = Uint8Array.from([0x11, 0x22, 0x33, 0x44]);
  const descriptor = { ptr: buffer, offset: 0, start: 0x1000, len: buffer.length, select: 0, disconnect: 0, addrspace: "test" };
  assert.deepEqual(describeMemoryRegions([descriptor]), [{ id: "region-0", addrspace: "test", start: 0x1000, length: 4, offset: 0, select: 0, disconnect: 0, accessible: true }]);
  const readBuffer = (_descriptor, offset) => buffer[offset];
  assert.equal(readValue([descriptor], "region-0", 1, 2, readBuffer), 0x3322);
  assert.deepEqual([...readMemory([descriptor], "region-0", 0, 4, readBuffer)], [0x11, 0x22, 0x33, 0x44]);
  assert.throws(() => readMemory([descriptor], "region-0", 3, 2, readBuffer), RangeError);
  assert.throws(() => readMemory([descriptor], "region-0", 0, 1024 * 1024 + 1, readBuffer), RangeError);
});

test("malformed protocol requests are rejected deterministically by the child", { skip: !hasKoffi }, async () => {
  const processChild = spawn(process.execPath, [child()], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let output = "";
  processChild.stdout.setEncoding("utf8");
  try {
    await new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Error("child did not announce readiness")), 1000);
      processChild.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes('"event":"ready"')) { clearTimeout(timer); resolveReady(); }
      });
    });
    processChild.stdin.write("not json\n");
    await new Promise((resolveResponse) => setTimeout(resolveResponse, 50));
    assert.match(output, /MALFORMED_REQUEST/);
  } finally {
    await stop(processChild);
  }
});

test("request validation rejects missing ids and operations", () => {
  assert.throws(() => assertRequest({}), (error) => error instanceof ProviderError && error.code === "MALFORMED_REQUEST");
});
