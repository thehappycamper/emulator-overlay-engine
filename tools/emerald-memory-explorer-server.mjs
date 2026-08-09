// Developer-only local server for the Emerald memory/state explorer
// (P05-T008). Serves the static explorer UI and exposes exactly three
// read-only GET endpoints that proxy already-written local files:
//
//   GET /api/watches -> the explorer connector's raw-memory diagnostic file
//   GET /api/source  -> the provider-neutral Emerald acquisition source snapshot
//   GET /api/state   -> the normalized Pokemon overlay live-state.json
//
// There is deliberately no POST/PUT/DELETE route and no code path that
// writes to any emulator-related file: this process only ever reads local
// JSON files that some other process (the explorer connector, the mapping
// watcher) already wrote, and serves static assets. It cannot mutate
// emulator memory, because it never talks to the emulator at all - the
// connector Lua script is the only thing that does, and it is read-only.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public", "emerald-memory-explorer");

export function resolveExplorerPaths(environment = process.env) {
  return {
    watchesPath: path.resolve(
      root,
      environment.EMERALD_MEMORY_EXPLORER_DIAGNOSTIC_PATH || "var/snapshots/emerald-memory-explorer.diagnostic.json",
    ),
    sourcePath: path.resolve(
      root,
      environment.EMERALD_SOURCE_SNAPSHOT_PATH || "var/snapshots/emerald-us-rev0.source.json",
    ),
    statePath: path.resolve(root, environment.EOE_LIVE_STATE_PATH || "public/live-state.json"),
  };
}

async function readJsonOrNull(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function serveStaticFile(response, filePath) {
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const data = await fs.readFile(normalized);
    response.writeHead(200, { "content-type": mimeTypes[path.extname(normalized)] || "application/octet-stream" });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

export function createExplorerServer({ environment = process.env } = {}) {
  const paths = resolveExplorerPaths(environment);

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "This developer tool is read-only; only GET is supported." });
      return;
    }

    if (url.pathname === "/api/watches") {
      sendJson(response, 200, await readJsonOrNull(paths.watchesPath));
      return;
    }
    if (url.pathname === "/api/source") {
      sendJson(response, 200, await readJsonOrNull(paths.sourcePath));
      return;
    }
    if (url.pathname === "/api/state") {
      sendJson(response, 200, await readJsonOrNull(paths.statePath));
      return;
    }

    if (url.pathname === "/tools/emerald-memory-explorer-lib.mjs") {
      await serveStaticFile(response, path.join(root, "tools", "emerald-memory-explorer-lib.mjs"));
      return;
    }

    const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
    await serveStaticFile(response, path.join(publicRoot, requestedPath));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.EMERALD_MEMORY_EXPLORER_PORT || 5190);
  const server = createExplorerServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`Emerald memory explorer (developer tool, read-only) running at http://127.0.0.1:${port}`);
  });
}
