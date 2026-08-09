import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  mapEmeraldSourceSnapshot,
  writePokemonLiveState,
} from "../adapters/pokemon-emerald-us-rev0/emerald-state-mapping.js";

const sourcePath = resolve(
  process.env.EMERALD_SOURCE_SNAPSHOT_PATH || "var/snapshots/emerald-us-rev0.source.json",
);
const targetPath = resolve(process.env.EOE_LIVE_STATE_PATH || "public/live-state.json");
const intervalMs = Number(process.env.EMERALD_MAPPING_POLL_INTERVAL_MS || 250);
const runOnce = process.argv.includes("--once");

if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
  throw new RangeError("EMERALD_MAPPING_POLL_INTERVAL_MS must be a positive number");
}

let lastObservedSource;
let lastErrorMessage;
let timer;
let stopped = false;

async function processSnapshot(force = false) {
  const sourceText = await readFile(sourcePath, "utf8");
  if (!force && sourceText === lastObservedSource) {
    return false;
  }
  lastObservedSource = sourceText;

  const state = mapEmeraldSourceSnapshot(JSON.parse(sourceText));
  await writePokemonLiveState(targetPath, state);
  lastErrorMessage = undefined;
  console.log(`Mapped Emerald source snapshot to ${targetPath}`);
  return true;
}

async function poll() {
  try {
    await processSnapshot();
  } catch (error) {
    if (error.message !== lastErrorMessage) {
      console.error(`Emerald live-state mapping failed: ${error.message}`);
      lastErrorMessage = error.message;
    }
  } finally {
    if (!stopped) {
      timer = setTimeout(poll, intervalMs);
    }
  }
}

console.log(`Watching Emerald source snapshot: ${sourcePath}`);
console.log(`Validated Pokemon live state: ${targetPath}`);

if (runOnce) {
  try {
    await processSnapshot(true);
  } catch (error) {
    console.error(`Emerald live-state mapping failed: ${error.message}`);
    process.exitCode = 1;
  }
} else {
  process.once("SIGINT", () => {
    stopped = true;
    clearTimeout(timer);
    process.exitCode = 0;
  });
  await poll();
}
