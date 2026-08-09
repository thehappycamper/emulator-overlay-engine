// Bounded, one-shot local proof for the Libretro -> Emerald thin adapter:
// starts the isolated Libretro provider, acquires exactly one validated
// Emerald source snapshot, maps it to normalized Pokemon overlay state,
// optionally publishes both to disk, shuts the provider down, and exits.
// This is deliberately not a polling session or a frontend - it proves
// the pipeline end to end for one snapshot, matching the "smallest that
// proves the architecture" scope of P05-T014. A future unified session
// command (mirroring P05-T012's tools/proof-session.mjs, not duplicated
// here) can compose this same acquire/map/publish sequence into a
// longer-running loop without changing anything in this file.
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runOnceEmeraldLibretroAcquisition } from "../adapters/libretro-emerald/acquire.js";
import { computeEmeraldRomIdentityFromBytes, assertSupportedEmeraldIdentity } from "../adapters/libretro-emerald/identity.js";
import { mapEmeraldSourceSnapshot, writePokemonLiveState } from "../adapters/pokemon-emerald-us-rev0/emerald-state-mapping.js";
import { writeEmeraldSourceSnapshot } from "../adapters/pokemon-emerald-us-rev0/write-source-snapshot.js";

export class LibretroEmeraldProofConfigError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "LibretroEmeraldProofConfigError";
  }
}

function readRequired(name, environment) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new LibretroEmeraldProofConfigError(
      `Missing required ${name}. Set it in your shell or a local .env file per experiments/libretro-provider/README.md's documented convention (see experiments/libretro-direct-host/.env.local.example).`,
    );
  }
  return resolve(value);
}

export function readLibretroEmeraldProofConfig(environment = process.env) {
  return Object.freeze({
    corePath: readRequired("LIBRETRO_CORE_PATH", environment),
    contentPath: readRequired("EMERALD_ROM_PATH", environment),
    sourceSnapshotPath: environment.EMERALD_SOURCE_SNAPSHOT_PATH?.trim() ? resolve(environment.EMERALD_SOURCE_SNAPSHOT_PATH.trim()) : null,
    liveStatePath: environment.EOE_LIVE_STATE_PATH?.trim() ? resolve(environment.EOE_LIVE_STATE_PATH.trim()) : null,
  });
}

async function assertFileExists(path, label) {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
  } catch (error) {
    throw new LibretroEmeraldProofConfigError(`${label} does not exist or is not a file: ${path}`, { cause: error });
  }
}

// Validates configuration and the configured ROM's identity without
// spawning the provider - mirrors this project's established `--check`
// convention (tools/bizhawk-proof-config.mjs, tools/proof-emerald-bizhawk.mjs).
export async function checkLibretroEmeraldProofConfig(environment = process.env) {
  const config = readLibretroEmeraldProofConfig(environment);
  await assertFileExists(config.corePath, "LIBRETRO_CORE_PATH");
  await assertFileExists(config.contentPath, "EMERALD_ROM_PATH");
  const bytes = await readFile(config.contentPath);
  const identity = computeEmeraldRomIdentityFromBytes(bytes);
  assertSupportedEmeraldIdentity(identity);
  return config;
}

export async function runLibretroEmeraldProof({
  environment = process.env,
  log = (line) => console.log(line),
  clientImpl,
  bootstrapFrames = 0,
} = {}) {
  const config = readLibretroEmeraldProofConfig(environment);
  const { LibretroProviderClient } = clientImpl
    ? { LibretroProviderClient: clientImpl }
    : await import("../experiments/libretro-provider/client.mjs");
  const client = new LibretroProviderClient();

  log(`Acquiring one Emerald source snapshot via the isolated Libretro provider (core: ${config.corePath})...`);
  const snapshot = await runOnceEmeraldLibretroAcquisition({
    client,
    corePath: config.corePath,
    contentPath: config.contentPath,
    bootstrapFrames,
  });
  log(
    `Snapshot acquired: party ${snapshot.party.count}, battle active ${snapshot.battle.active}, location ${snapshot.location?.name ?? "unknown"}.`,
  );

  if (config.sourceSnapshotPath) {
    await writeEmeraldSourceSnapshot(config.sourceSnapshotPath, snapshot);
    log(`Source snapshot written to ${config.sourceSnapshotPath}`);
  }

  const state = mapEmeraldSourceSnapshot(snapshot);
  log(`Mapped to Pokemon overlay state (${state.player.party.length} party member(s)).`);

  if (config.liveStatePath) {
    await writePokemonLiveState(config.liveStatePath, state);
    log(`Live state written to ${config.liveStatePath}`);
  }

  return { snapshot, state };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const checkOnly = process.argv.includes("--check");
  (async () => {
    if (checkOnly) {
      const config = await checkLibretroEmeraldProofConfig();
      console.log(`Local config is valid.`);
      console.log(`LIBRETRO_CORE_PATH: ${config.corePath}`);
      console.log(`EMERALD_ROM_PATH: ${config.contentPath} (identity verified)`);
      console.log("No processes were launched.");
      return;
    }
    await runLibretroEmeraldProof();
    console.log("Libretro Emerald proof complete.");
  })()
    .then(() => { process.exitCode = 0; })
    .catch((error) => {
      console.error(`Libretro Emerald proof failed: ${error.message}`);
      process.exitCode = 1;
    });
}
