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
// once, via a single top-level try/finally that wraps every ABI call from
// retro_api_version() onward - including callback registration - so a
// failure at any point (a version mismatch, a registration failure, a
// thrown error mid-run) always runs the same deterministic cleanup and
// always reports what was actually attempted, never just what was hoped
// for. The report's `callbackInvocationCounts` are real counters
// incremented inside each callback body, not an assumption: they are the
// evidence for which callbacks native code actually invoked, not a claim
// made without checking. See README.md's "Process exit and koffi callback
// cleanup" section for a disclosed, environment-specific caveat about
// process-exit behavior found while adding this cleanup.

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
    callbackInvocationCounts: null,
    memoryMap: null,
    loadGameResult: null,
    retroRunInvoked: false,
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

  // Tracked outside the try block so the finally below can always see
  // exactly which callbacks were successfully registered so far, even if a
  // later registration call (or any other ABI call) throws before
  // registration finishes.
  const registeredCallbacks = [];

  try {
    // Required by the task: retro_api_version() is the very first ABI call
    // after loading the core, and a mismatch fails closed immediately -
    // before retro_get_system_info(), before any callback registration,
    // before any retro_set_* call. libretro.h pins RETRO_API_VERSION at 1
    // and has never changed it; a core reporting anything else is not a
    // core this spike (or a real integration) can safely assume ABI
    // compatibility with.
    const apiVersion = core.retro_api_version();
    report.apiVersion = { actual: apiVersion, expected: RETRO_API_VERSION, matches: apiVersion === RETRO_API_VERSION };
    if (!report.apiVersion.matches) {
      throw new Error(
        `retro_api_version() mismatch: core reports ${apiVersion}, expected ${RETRO_API_VERSION}. ` +
          "Refusing to make any further ABI calls or register any callbacks against a core whose " +
          "API version was not confirmed compatible first.",
      );
    }
    console.log(`retro_api_version() = ${apiVersion} (matches expected ${RETRO_API_VERSION})`);

    const info = {};
    core.retro_get_system_info(info);
    report.systemInfo = info;
    console.log("System info:", info);

    let latestMemoryMap = [];

    // Real counters incremented from inside each callback body - this is
    // the actual evidence for which callbacks native code invoked, printed
    // in the final report, not merely asserted in prose after the fact.
    const invocationCounts = {
      environment: 0,
      videoRefresh: 0,
      audioSample: 0,
      audioSampleBatch: 0,
      inputPoll: 0,
      inputState: 0,
    };
    report.callbackInvocationCounts = invocationCounts;

    function environmentCallback(cmd, data) {
      invocationCounts.environment += 1;
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

    // Every koffi.register() call here is tracked in registeredCallbacks
    // immediately upon success, so the finally block below can unregister
    // exactly what was actually registered - including a run that fails
    // partway through this very sequence (e.g. the 4th of 6 registrations
    // throwing) - not just a run that reaches retro_init() successfully.
    function registerCallback(fn, protoType) {
      const ptr = koffi.register(fn, koffi.pointer(protoType));
      registeredCallbacks.push(ptr);
      report.cleanup.callbacksRegistered += 1;
      return ptr;
    }

    const envPtr = registerCallback(environmentCallback, RetroEnvironmentCB);
    const videoPtr = registerCallback(() => {
      invocationCounts.videoRefresh += 1;
    }, RetroVideoRefreshCB);
    const audioPtr = registerCallback(() => {
      invocationCounts.audioSample += 1;
    }, RetroAudioSampleCB);
    const audioBatchPtr = registerCallback((_data, frames) => {
      invocationCounts.audioSampleBatch += 1;
      return frames;
    }, RetroAudioSampleBatchCB);
    const pollPtr = registerCallback(() => {
      invocationCounts.inputPoll += 1;
    }, RetroInputPollCB);
    const statePtr = registerCallback(() => {
      invocationCounts.inputState += 1;
      return 0;
    }, RetroInputStateCB);

    core.retro_set_environment(envPtr);
    core.retro_set_video_refresh(videoPtr);
    core.retro_set_audio_sample(audioPtr);
    core.retro_set_audio_sample_batch(audioBatchPtr);
    core.retro_set_input_poll(pollPtr);
    core.retro_set_input_state(statePtr);

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
        "Core rejected the ROM. retro_run() was never called, SET_MEMORY_MAPS was never received\n" +
          "(the core only publishes it after a successful retro_load_game), and no emulated-memory\n" +
          "read was attempted - see callbackInvocationCounts in the printed report below for the\n" +
          "actual per-callback invocation counts proving this, not just this message's say-so. This\n" +
          "is where this spike's empirical verification stops in an environment without an operator-\n" +
          "supplied, legally obtained Emerald ROM. See the task record for what was verified before\n" +
          "this point and why.",
      );
      return;
    }
    report.cleanup.gameLoadedSuccessfully = true;

    const frameCount = 120;
    console.log(`Running ${frameCount} frames...`);
    report.retroRunInvoked = true;
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
    // block above exited: an early api-version-mismatch throw (zero
    // callbacks registered), a throw partway through registration (some
    // callbacks registered), the early return on ROM rejection (all
    // callbacks registered, retro_init reached, no game loaded), normal
    // completion, or any other thrown error. Each step is independently
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
    // this run actually registered - registeredCallbacks reflects exactly
    // that, however far the try block above got. Whether it prevents the
    // process-exit crash documented in the README is empirically
    // inconclusive in this environment - the attempt itself is still
    // correct practice (avoids leaking callback slots in a longer-lived
    // host) and is recorded either way.
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
