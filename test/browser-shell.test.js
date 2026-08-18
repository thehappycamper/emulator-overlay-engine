import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
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

// Minimal Chrome DevTools Protocol client - just enough to drive a live,
// interactive headless page over time (unlike `--dump-dom`'s one-shot
// snapshot below, which can't script a sequence of "wait for the poll
// interval, then check DOM state" steps). Uses only Node's built-in
// fetch/WebSocket - no new dependency for this one test.
async function waitForDevtools(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
}

async function openCdpSession(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const target = targets.find((candidate) => candidate.type === "page");
  if (!target) {
    throw new Error("No page target found on the Chrome DevTools endpoint");
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const handler = (event) => {
        const message = JSON.parse(event.data);
        if (message.id === id) {
          ws.removeEventListener("message", handler);
          if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
          else resolve(message.result);
        }
      };
      ws.addEventListener("message", handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Evaluates `expression` in the page and returns its value by-reference
  // (only JSON-compatible/primitive results are needed by this test).
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(`Page evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return result.result.value;
  }

  return {
    evaluate,
    async close() {
      ws.close();
    },
  };
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

// Real, interactive end-to-end proof (P05-T018) that a user's expanded/
// collapsed <details> disclosure choice survives an ordinary live-state
// re-render, and that a genuinely different/disappeared panel never
// inherits stale state. This is the strongest available proof of the real
// lifecycle bug (contentEl.innerHTML replacement discarding live DOM
// state) and its fix - test/overlay-disclosure-state.test.js proves the
// capture/restore logic in isolation, fast; this proves the whole pipeline
// (polling -> change detection -> innerHTML replace -> restore) actually
// behaves this way in a real browser, not just that the helper functions
// are individually correct.
test("disclosure panels keep their user-set open/closed state across ordinary live-state re-renders, and a panel that disappears and later reappears defaults instead of leaking stale state", { skip: !chromePath }, async (t) => {
  const port = 5199;
  const cdpPort = 9222;
  const statePath = path.join(repositoryRoot, "public", "__test-disclosure-state.json");
  const userDataDir = await mkdtemp(path.join(tmpdir(), "eoe-disclosure-state-"));

  const baseFixture = JSON.parse(await readFile(
    path.join(repositoryRoot, "public", "sample-state.json"),
    "utf8",
  ));
  baseFixture.battle.trainerBattle = false; // wild battle, so the Poke Balls panel renders too

  async function writeState(mutate) {
    const state = structuredClone(baseFixture);
    mutate(state);
    await writeFile(statePath, JSON.stringify(state), "utf8");
  }

  const server = spawn(process.execPath, ["tools/dev-server.mjs"], {
    cwd: repositoryRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  let chrome;
  let cdp;

  t.after(async () => {
    await cdp?.close().catch(() => {});
    chrome?.kill();
    server.kill();
    await unlink(statePath).catch(() => {});
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  });

  await writeState(() => {}); // initial state, unmodified
  await waitForServer(`http://127.0.0.1:${port}/`);

  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${cdpPort}`,
    `http://127.0.0.1:${port}/?state=/public/__test-disclosure-state.json`,
  ], { stdio: "ignore" });

  await waitForDevtools(cdpPort);
  cdp = await openCdpSession(cdpPort);

  const disclosureState = () => cdp.evaluate(`({
    statCompare: document.querySelector('[data-disclosure-id="battle-stat-compare"]')?.open ?? null,
    encounters: document.querySelector('[data-disclosure-id="location-encounters"]')?.open ?? null,
    balls: document.querySelector('[data-disclosure-id="battle-balls"]')?.open ?? null,
  })`);

  // First render (default poll interval is 1000ms) - give it time to land.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // G: fresh page load - every disclosure exists and is closed by default.
  const initial = await disclosureState();
  assert.deepEqual(initial, { statCompare: false, encounters: false, balls: false });

  // Expand two panels, deliberately leave one collapsed - three distinct
  // states in one page, to prove independence (E) rather than a single
  // shared flag.
  await cdp.evaluate(`document.querySelector('[data-disclosure-id="battle-stat-compare"]').open = true`);
  await cdp.evaluate(`document.querySelector('[data-disclosure-id="battle-balls"]').open = true`);
  // location-encounters is left closed (already false).

  // A/B/D/E: an ordinary HP change re-renders the dashboard - all three
  // states must survive exactly as set.
  await writeState((state) => {
    state.player.party[0].currentHp -= 10;
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.deepEqual(await disclosureState(), { statCompare: true, encounters: false, balls: true });

  // C: a stat-stage-only change (no HP/PP change at all) is still an
  // ordinary re-render and must not reset anything either.
  await writeState((state) => {
    state.battle.opponent.statStages = { atk: -1, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.deepEqual(await disclosureState(), { statCompare: true, encounters: false, balls: true });

  // F (part 1): the battle ends - the battle-only panels (stat-compare,
  // balls) disappear entirely; the always-present encounters panel must be
  // unaffected by their disappearance.
  await writeState((state) => {
    state.battle.opponent = null;
    state.battle.trainerBattle = null;
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const duringNoBattle = await disclosureState();
  assert.deepEqual(duringNoBattle, { statCompare: null, encounters: false, balls: null });

  // F (part 2): a new battle starts - the same-identity panels reappear,
  // but must come back at their own real default (closed), never silently
  // inheriting the "open" state captured before they disappeared.
  await writeState((state) => {
    state.battle.trainerBattle = false;
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.deepEqual(await disclosureState(), { statCompare: false, encounters: false, balls: false });
});