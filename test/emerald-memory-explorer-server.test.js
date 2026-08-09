import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createExplorerServer, resolveExplorerPaths } from "../tools/emerald-memory-explorer-server.mjs";

async function withServer(environment, run) {
  const server = createExplorerServer({ environment });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

test("resolveExplorerPaths defaults match the documented production file locations", () => {
  const paths = resolveExplorerPaths({});
  assert.match(paths.watchesPath, /emerald-memory-explorer\.diagnostic\.json$/);
  assert.match(paths.sourcePath, /emerald-us-rev0\.source\.json$/);
  assert.match(paths.statePath, /live-state\.json$/);
});

test("GET /api/watches, /api/source, /api/state proxy real local files as JSON", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "emerald-explorer-server-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const watchesPath = join(root, "watches.json");
  const sourcePath = join(root, "source.json");
  const statePath = join(root, "state.json");
  await writeFile(watchesPath, JSON.stringify({ provider: "bizhawk", watches: [{ label: "hp", u8: 31 }] }), "utf8");
  await writeFile(sourcePath, JSON.stringify({ contract: { id: "pokemon.emerald.us-rev0.acquisition" } }), "utf8");
  await writeFile(statePath, JSON.stringify({ schemaVersion: "0.1.0" }), "utf8");

  const environment = {
    EMERALD_MEMORY_EXPLORER_DIAGNOSTIC_PATH: watchesPath,
    EMERALD_SOURCE_SNAPSHOT_PATH: sourcePath,
    EOE_LIVE_STATE_PATH: statePath,
  };

  await withServer(environment, async (base) => {
    const watches = await (await fetch(`${base}/api/watches`)).json();
    assert.equal(watches.provider, "bizhawk");
    assert.equal(watches.watches[0].u8, 31);

    const source = await (await fetch(`${base}/api/source`)).json();
    assert.equal(source.contract.id, "pokemon.emerald.us-rev0.acquisition");

    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.schemaVersion, "0.1.0");
  });
});

test("missing diagnostic/source/state files resolve to null rather than an error", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "emerald-explorer-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const environment = {
    EMERALD_MEMORY_EXPLORER_DIAGNOSTIC_PATH: join(root, "missing-watches.json"),
    EMERALD_SOURCE_SNAPSHOT_PATH: join(root, "missing-source.json"),
    EOE_LIVE_STATE_PATH: join(root, "missing-state.json"),
  };

  await withServer(environment, async (base) => {
    for (const path of ["/api/watches", "/api/source", "/api/state"]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      assert.equal(await response.json(), null);
    }
  });
});

test("the explorer server exposes no mutation surface: every non-GET method is rejected", async () => {
  await withServer({}, async (base) => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await fetch(`${base}/api/watches`, { method });
      assert.equal(response.status, 405);
      const body = await response.json();
      assert.match(body.error, /read-only/i);
    }
  });
});

test("path traversal outside the repository root is rejected when serving static files", async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/../../../../etc/passwd`);
    assert.ok([403, 404].includes(response.status));
  });
});

test("unknown static path returns 404, not a stack trace or file contents", async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/does-not-exist.html`);
    assert.equal(response.status, 404);
  });
});
