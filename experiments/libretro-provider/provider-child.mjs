import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import koffi from "koffi";
import {
  RetroAudioSampleBatchCB, RetroAudioSampleCB, RetroEnvironmentCB, RetroInputPollCB,
  RetroInputStateCB, RetroVideoRefreshCB, RETRO_API_VERSION, RETRO_ENVIRONMENT_SET_MEMORY_MAPS,
  decodeMemoryMap, loadLibretroCore,
} from "./libretro-abi.mjs";
import { describeMemoryRegions, readMemory, readValue } from "./memory.mjs";
import { assertRequest, errorPayload, ProviderError, PROTOCOL_VERSION } from "./protocol.mjs";

let runtime = null;
let closing = false;

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }

function cleanup() {
  if (!runtime) return { unloaded: false, deinitialized: false, callbacksUnregistered: 0 };
  const result = { unloaded: false, deinitialized: false, callbacksUnregistered: 0 };
  if (runtime.loaded) { try { runtime.core.retro_unload_game(); result.unloaded = true; } catch {} }
  if (runtime.initialized) { try { runtime.core.retro_deinit(); result.deinitialized = true; } catch {} }
  for (const callback of runtime.callbacks) { try { koffi.unregister(callback); result.callbacksUnregistered += 1; } catch {} }
  runtime = null;
  return result;
}

function callbackSet() {
  const memory = { descriptors: [] };
  const counts = { environment: 0, video: 0, audio: 0, audioBatch: 0, inputPoll: 0, inputState: 0 };
  const environment = (command, data) => {
    counts.environment += 1;
    if (command === RETRO_ENVIRONMENT_SET_MEMORY_MAPS) { memory.descriptors = decodeMemoryMap(data); return true; }
    return false;
  };
  const callbacks = [
    [environment, RetroEnvironmentCB],
    [() => { counts.video += 1; }, RetroVideoRefreshCB],
    [() => { counts.audio += 1; }, RetroAudioSampleCB],
    [(_data, frames) => { counts.audioBatch += 1; return frames; }, RetroAudioSampleBatchCB],
    [() => { counts.inputPoll += 1; }, RetroInputPollCB],
    [() => { counts.inputState += 1; return 0; }, RetroInputStateCB],
  ];
  return { memory, counts, callbacks };
}

async function initialize(params) {
  if (runtime) throw new ProviderError("ALREADY_INITIALIZED", "Provider is already initialized");
  if (typeof params?.corePath !== "string" || !params.corePath) throw new ProviderError("MALFORMED_REQUEST", "corePath is required");
  if (typeof params?.contentPath !== "string" || !params.contentPath) throw new ProviderError("MALFORMED_REQUEST", "contentPath is required");
  const core = loadLibretroCore(params.corePath);
  const apiVersion = core.retro_api_version();
  if (apiVersion !== RETRO_API_VERSION) throw new ProviderError("CORE_ABI_MISMATCH", `Core API ${apiVersion} does not match ${RETRO_API_VERSION}`);
  const info = {};
  core.retro_get_system_info(info);
  const set = callbackSet();
  const registered = [];
  let initialized = false;
  let loaded = false;
  try {
    const pointers = set.callbacks.map(([fn, proto]) => { const pointer = koffi.register(fn, koffi.pointer(proto)); registered.push(pointer); return pointer; });
    core.retro_set_environment(pointers[0]);
    core.retro_set_video_refresh(pointers[1]);
    core.retro_set_audio_sample(pointers[2]);
    core.retro_set_audio_sample_batch(pointers[3]);
    core.retro_set_input_poll(pointers[4]);
    core.retro_set_input_state(pointers[5]);
    core.retro_init();
    initialized = true;
    const bytes = await readFile(params.contentPath);
    const didLoad = core.retro_load_game({ path: params.contentPath, data: bytes, size: bytes.length, meta: null });
    if (!didLoad) throw new ProviderError("CONTENT_REJECTED", "Libretro core rejected content");
    loaded = true;
    // Some cores publish memory maps on their first frame rather than from
    // retro_load_game. A single bootstrap frame makes discovery deterministic;
    // later frame requests remain explicit IPC operations.
    core.retro_run();
    if (!set.memory.descriptors.length) throw new ProviderError("MEMORY_MAP_UNAVAILABLE", "Core loaded content but published no memory descriptors");
    runtime = { core, callbacks: registered, initialized: true, loaded: true, memory: set.memory, info, content: { size: bytes.length } };
    return {
      protocolVersion: PROTOCOL_VERSION,
      core: { name: info.library_name ?? null, version: info.library_version ?? null, validExtensions: info.valid_extensions ?? null },
      content: runtime.content,
      capabilities: ["memory.regions", "memory.read8", "memory.read16", "memory.read32", "memory.readRange", "frame.execute"],
      memoryRegions: describeMemoryRegions(set.memory.descriptors),
    };
  } catch (error) {
    if (loaded) { try { core.retro_unload_game(); } catch {} }
    if (initialized) { try { core.retro_deinit(); } catch {} }
    for (const pointer of registered.reverse()) { try { koffi.unregister(pointer); } catch {} }
    throw error;
  }
}

function read(params, width) {
  if (!runtime) throw new ProviderError("NOT_INITIALIZED", "Provider is not initialized");
  const readBuffer = (descriptor, offset) => new Uint8Array(koffi.view(descriptor.ptr, descriptor.offset + descriptor.len))[offset];
  return { value: readValue(runtime.memory.descriptors, params?.regionId, params?.offset, width, readBuffer), width };
}

function range(params) {
  if (!runtime) throw new ProviderError("NOT_INITIALIZED", "Provider is not initialized");
  const bytes = readMemory(runtime.memory.descriptors, params?.regionId, params?.offset, params?.length,
    (descriptor, bufferOffset) => new Uint8Array(koffi.view(descriptor.ptr, descriptor.offset + descriptor.len))[bufferOffset]);
  return { bytes: bytes.toString("base64"), length: bytes.length };
}

async function handle(request) {
  assertRequest(request);
  switch (request.op) {
    case "initialize": return initialize(request.params);
    case "read8": return read(request.params, 1);
    case "read16": return read(request.params, 2);
    case "read32": return read(request.params, 4);
    case "readRange": return range(request.params);
    case "run": {
      if (!runtime) throw new ProviderError("NOT_INITIALIZED", "Provider is not initialized");
      const frames = request.params?.frames;
      if (!Number.isInteger(frames) || frames < 1 || frames > 10000) throw new ProviderError("MALFORMED_REQUEST", "frames must be an integer from 1 to 10000");
      for (let index = 0; index < frames; index += 1) runtime.core.retro_run();
      return { framesExecuted: frames };
    }
    case "shutdown": {
      const result = cleanup();
      closing = true;
      return result;
    }
    default: throw new ProviderError("UNKNOWN_OPERATION", `Unknown operation ${request.op}`);
  }
}

send({ event: "ready", protocolVersion: PROTOCOL_VERSION });
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", async (line) => {
  if (closing) return;
  let request;
  try { request = JSON.parse(line); }
  catch { send({ id: null, ok: false, error: errorPayload(new ProviderError("MALFORMED_REQUEST", "Request is not valid JSON")) }); return; }
  try {
    const result = await handle(request);
    send({ id: request.id, ok: true, result });
    if (request.op === "shutdown") setImmediate(() => process.exit(0));
  } catch (error) {
    send({ id: request?.id ?? null, ok: false, error: errorPayload(error) });
  }
});
