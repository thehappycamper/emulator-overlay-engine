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
    start: "0x" + descriptor.start.toString(16),
    len: "0x" + descriptor.len.toString(16),
    select: "0x" + descriptor.select.toString(16),
    disconnect: "0x" + descriptor.disconnect.toString(16),
    ptr: descriptor.ptr ? "(non-null)" : "(null)",
  };
}

async function main() {
  const config = await loadConfig();
  const report = { seenEnvironmentCommands: [], memoryMap: null, loadGameResult: null };

  const core = loadLibretroCore(config.LIBRETRO_CORE_PATH);

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

  const envPtr = koffi.register(environmentCallback, koffi.pointer(RetroEnvironmentCB));
  const videoPtr = koffi.register(() => {}, koffi.pointer(RetroVideoRefreshCB));
  const audioPtr = koffi.register(() => {}, koffi.pointer(RetroAudioSampleCB));
  const audioBatchPtr = koffi.register((_data, frames) => frames, koffi.pointer(RetroAudioSampleBatchCB));
  const pollPtr = koffi.register(() => {}, koffi.pointer(RetroInputPollCB));
  const statePtr = koffi.register(() => 0, koffi.pointer(RetroInputStateCB));

  core.retro_set_environment(envPtr);
  core.retro_set_video_refresh(videoPtr);
  core.retro_set_audio_sample(audioPtr);
  core.retro_set_audio_sample_batch(audioBatchPtr);
  core.retro_set_input_poll(pollPtr);
  core.retro_set_input_state(statePtr);

  core.retro_init();
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
    printFinalReport(report);
    return;
  }

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

  core.retro_unload_game();
  core.retro_deinit();

  printFinalReport(report);
}

function printFinalReport(report) {
  console.log("\n=== SPIKE REPORT (JSON) ===");
  console.log(JSON.stringify(report, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
}

main().catch((error) => {
  console.error("Spike failed:", error);
  process.exitCode = 1;
});
