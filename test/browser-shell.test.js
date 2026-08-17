import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const chromeCandidates = [
  process.env.EOE_CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));

async function waitForServer(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Dev server did not become ready");
}

test("real public app shell resolves browser imports and renders a notification", { skip: !chromePath }, async () => {
  const port = 5198;
  const notificationPath = path.join(repositoryRoot, "public", "notifications.json");
  const userDataDir = await mkdtemp(path.join(tmpdir(), "eoe-browser-shell-"));
  const fixture = {
    notifications: [{
      id: "browser-smoke-1",
      message: "<img src=x onerror=alert(1)> Browser smoke",
      severity: "warn",
      deliveredAt: "2026-08-16T00:00:00.000Z",
    }],
  };
  const server = spawn(process.execPath, ["tools/dev-server.mjs"], {
    cwd: repositoryRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });

  try {
    await writeFile(notificationPath, JSON.stringify(fixture), "utf8");
    await waitForServer(`http://127.0.0.1:${port}/`);
    const result = spawnSync(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--user-data-dir=${userDataDir}`,
      "--dump-dom",
      "--virtual-time-budget=4000",
      `http://127.0.0.1:${port}/`,
    ], { encoding: "utf8", timeout: 15000 });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Live: \/public\/sample-state\.json/);
    assert.match(result.stdout, /Browser smoke/);
    assert.match(result.stdout, /&lt;img/);
    assert.doesNotMatch(result.stdout, /<img src="x"/);
    assert.match(result.stdout, /class="notifications"/);
  } finally {
    await unlink(notificationPath).catch(() => {});
    server.kill();
    await rm(userDataDir, { recursive: true, force: true });
  }
});