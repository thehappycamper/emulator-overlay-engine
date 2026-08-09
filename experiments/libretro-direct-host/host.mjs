// Libretro direct-host feasibility spike (P05-T007).
//
// Dynamically loads a locally configured mGBA libretro core, runs it through
// the official libretro ABI (init -> load_game -> run), inspects the
// published memory maps (RETRO_ENVIRONMENT_SET_MEMORY_MAPS), and attempts to
// read one known Emerald Rev 0 address (player party count) using the
// existing, already-reviewed Gen III acquisition constants.
//
// This is a spike, not a production frontend: only the minimum plumbing
// needed to observe real emulated memory is implemented. See README.md for
// what this intentionally does not do, and the task record for what was and
// was not possible to verify empirically in this environment (no legally
// obtainable Emerald ROM was available here - see "Save-state and ROM
// limitations" in the task record).
//
// This file always prints a "=== SPIKE REPORT (JSON) ===" block exactly
// once, via a single top-level try/finally, whether the run stops early
// (ROM rejected), succeeds, or throws. The report's `cleanup` section
// records whether retro_deinit() and koffi.unregister() were actually
// attempted and whether they reported success - see README.md's "Process
// exit and koffi callback cleanup" section for a disclosed, environment-
// specific caveat found while adding this cleanup: this spike cannot
// promise a clean process exit code even when every step above succeeds.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import koffi from "koffi";

import { EMERALD_US_REV0 } from "../../adapters/gen3-mgba/emerald-us-rev0.js";
import {
  RetroAudioSampleBatchCB,
  RetroAudioSampleCB,
  RetroEnvironmentCB,
  RetroInputPollCB,
  RetroInputStateCB,
  RetroVideoRefreshCB,
  RETRO_API_VERSION,
  RETRO_ENVIRONMENT_SET_MEMORY_MAPS,
  decodeMemoryMap,
  loadLibretroCore,
} from "./libretro-abi.mjs";
import { findDescriptorForAddress, translateAddressToBufferOffset } from "./address-translate.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const envLocalPath = resolve(projectRoot, ".env.local");

function parseLocalEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

async function loadConfig() {
  let text;
  try {
    text = await readFile(envLocalPath, "utf8");
  } catch (error) {
    throw new Error(
      `Could not read ${envLocalPath}. Copy .env.local.example to .env.local and fill in local paths.`,
      { cause: error },
    );
  }
  const values = parseLocalEnv(text);
  for (const key of ["LIBRETRO_CORE_PATH", "EMERALD_ROM_PATH"]) {
    if (!values[key]) {
      throw new Error(`Missing required ${key} in ${envLocalPath}`);
    }
  }
  return values;
}

function bytesToHex(descriptor) {
  return {
    ...descriptor,
    offset: "0x" + descriptor.offset.toString(16),
    start: "0x" + descriptor.start.toString(16),
    len: "0x" + descriptor.len.toString(16),
    select: "0x" + descriptor.select.toString(16),
    disconnect: "0x" + descriptor.disconnect.toString(16),
    ptr: descriptor.ptr ? "(non-null)" : "(null)",
  };
}

async function main() {
  const config = await loadConfig();
  const report = {
    apiVersion: null,
    seenEnvironmentCommands: [],
    memoryMap: null,
    loadGameResult: null,
    cleanup: {
      retroInitReached: false,
      gameLoadedSuccessfully: false,
      unloadGame: "not attempted",
      deinit: "not attempted",
      callbacksRegistered: 0,
      callbacksUnregistered: 0,
      unregisterErrors: [],
    },
  };

  const core = loadLibretroCore(config.LIBRETRO_CORE_PATH);

  // Required by the task: call and validate retro_api_version() before
  // anything else. libretro.h pins RETRO_API_VERSION at 1 and has never
  // changed it; a mismatch would indicate an incompatible/unusual core, so
  // this is reported prominently but does not hard-abort the spike - the
  // point here is to observe and record reality, not to gate on it.
  const apiVersion = core.retro_api_version();
  report.apiVersion = { actual: apiVersion, expected: RETRO_API_VERSION, matches: apiVersion === RETRO_API_VERSION };
  console.log(
    `retro_api_version() = ${apiVersion} (expected ${RETRO_API_VERSION}; ` +
      `${report.apiVersion.matches ? "matches" : "MISMATCH - proceeding anyway for observation, but a real integration must treat this as a hard compatibility gate"})`,
  );

  const info = {};
  core.retro_get_system_info(info);
  report.systemInfo = info;
  console.log("System info:", info);

  let latestMemoryMap = [];

  function environmentCallback(cmd, data) {
    report.seenEnvironmentCommands.push(cmd);
    if (cmd === RETRO_ENVIRONMENT_SET_MEMORY_MAPS) {
      latestMemoryMap = decodeMemoryMap(data);
      report.memoryMap = latestMemoryMap.map(bytesToHex);
      console.log("Received SET_MEMORY_MAPS with", latestMemoryMap.length, "descriptor(s):");
      console.log(JSON.stringify(report.memoryMap, null, 2));
      return true;
    }
    return false; // decline everything else - see README for why this is safe
  }

  // Every koffi.register() call here is paired with a koffi.unregister()
  // attempt in the finally block below, tracked via this array. See
  // README.md for what was empirically observed about this cleanup path in
  // this environment.
  const registeredCallbacks = [];
  function registerCallback(fn, protoType) {
    const ptr = koffi.register(fn, koffi.pointer(protoType));
    registeredCallbacks.push(ptr);
    report.cleanup.callbacksRegistered += 1;
    return ptr;
  }

  const envPtr = registerCallback(environmentCallback, RetroEnvironmentCB);
  const videoPtr = registerCallback(() => {}, RetroVideoRefreshCB);
  const audioPtr = registerCallback(() => {}, RetroAudioSampleCB);
  const audioBatchPtr = registerCallback((_data, frames) => frames, RetroAudioSampleBatchCB);
  const pollPtr = registerCallback(() => {}, RetroInputPollCB);
  const statePtr = registerCallback(() => 0, RetroInputStateCB);

  core.retro_set_environment(envPtr);
  core.retro_set_video_refresh(videoPtr);
  core.retro_set_audio_sample(audioPtr);
  core.retro_set_audio_sample_batch(audioBatchPtr);
  core.retro_set_input_poll(pollPtr);
  core.retro_set_input_state(statePtr);

  try {
    core.retro_init();
    report.cleanup.retroInitReached = true;
    console.log("retro_init() completed. Environment commands seen so far:", report.seenEnvironmentCommands.length);

    const romBytes = await readFile(config.EMERALD_ROM_PATH);
    const gameInfo = {
      path: config.EMERALD_ROM_PATH,
      data: romBytes,
      size: romBytes.length,
      meta: null,
    };

    console.log(`Attempting retro_load_game (${romBytes.length} bytes)...`);
    const loaded = core.retro_load_game(gameInfo);
    report.loadGameResult = loaded;
    console.log("retro_load_game returned:", loaded);

    if (!loaded) {
      console.log(
        "Core rejected the ROM. This is where this spike's empirical verification stops in an\n" +
          "environment without an operator-supplied, legally obtained Emerald ROM. See the task\n" +
          "record for what was verified before this point and why.",
      );
      return;
    }
    report.cleanup.gameLoadedSuccessfully = true;

    const frameCount = 120;
    console.log(`Running ${frameCount} frames...`);
    const startedAt = process.hrtime.bigint();
    for (let i = 0; i < frameCount; i += 1) {
      core.retro_run();
    }
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    report.frameRunMs = elapsedMs;
    console.log(`Ran ${frameCount} frames in ${elapsedMs.toFixed(1)}ms (${(elapsedMs / frameCount).toFixed(3)}ms/frame).`);

    const partyCountAddress = EMERALD_US_REV0.addresses.playerPartyCount;
    const descriptor = findDescriptorForAddress(latestMemoryMap, partyCountAddress);

    if (!descriptor) {
      console.log(
        `No published memory descriptor covers 0x${partyCountAddress.toString(16)} (playerPartyCount).`,
      );
    } else {
      const offset = translateAddressToBufferOffset(descriptor, partyCountAddress);
      const view = koffi.view(descriptor.ptr, descriptor.len);
      const bytes = new Uint8Array(view);
      const partyCount = bytes[offset];
      report.partyCountRead = { address: "0x" + partyCountAddress.toString(16), offset, value: partyCount };
      console.log(
        `Read playerPartyCount (0x${partyCountAddress.toString(16)}) via descriptor "${descriptor.addrspace}",`,
        `buffer offset 0x${offset.toString(16)}: value = ${partyCount}`,
      );

      // Re-read after another batch of frames to observe whether the value is
      // stable/consistent across repeated retro_run() calls, not a one-off.
      for (let i = 0; i < frameCount; i += 1) {
        core.retro_run();
      }
      const secondRead = bytes[offset];
      report.partyCountReadAfterMoreFrames = secondRead;
      console.log(`Re-read after ${frameCount} more frames: value = ${secondRead}`);
    }
  } finally {
    // Deterministic cleanup, always attempted regardless of how the try
    // block above exited (early return on ROM rejection, normal
    // completion, or a thrown error). Each step is independently
    // try/caught so a failure in one does not skip the others, and every
    // outcome is recorded in the report rather than silently swallowed.
    if (report.cleanup.gameLoadedSuccessfully) {
      try {
        core.retro_unload_game();
        report.cleanup.unloadGame = "ok";
      } catch (error) {
        report.cleanup.unloadGame = `error: ${error.message}`;
      }
    }

    if (report.cleanup.retroInitReached) {
      try {
        core.retro_deinit();
        report.cleanup.deinit = "ok";
      } catch (error) {
        report.cleanup.deinit = `error: ${error.message}`;
      }
    }

    // See README.md: koffi.unregister() is the documented, correct call to
    // release a callback slot, and is attempted here for every callback
    // this run registered. Whether it prevents the process-exit crash
    // documented in the README is empirically inconclusive in this
    // environment - the attempt itself is still correct practice (avoids
    // leaking callback slots in a longer-lived host) and is recorded
    // either way.
    for (const ptr of registeredCallbacks) {
      try {
        koffi.unregister(ptr);
        report.cleanup.callbacksUnregistered += 1;
      } catch (error) {
        report.cleanup.unregisterErrors.push(error.message);
      }
    }
    console.log(
      `Cleanup: retro_unload_game=${report.cleanup.unloadGame}, retro_deinit=${report.cleanup.deinit}, ` +
        `koffi.unregister ${report.cleanup.callbacksUnregistered}/${report.cleanup.callbacksRegistered} callback(s).`,
    );

    printFinalReport(report);
  }
}

function printFinalReport(report) {
  console.log("\n=== SPIKE REPORT (JSON) ===");
  console.log(JSON.stringify(report, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
}

main().catch((error) => {
  console.error("Spike failed:", error);
  process.exitCode = 1;
});
