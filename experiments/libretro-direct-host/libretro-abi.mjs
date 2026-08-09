// Minimal subset of the libretro C ABI needed for this feasibility spike.
// Field layouts and constants are transcribed from the official, MIT-licensed
// libretro.h (https://github.com/libretro/RetroArch/blob/master/libretro-common/include/libretro.h),
// not reproduced in full here; only the small subset this spike calls is
// defined, each with the exact source line(s) it was checked against at the
// time of writing (header as of the RetroArch master branch, August 2026).

import koffi from "koffi";

// libretro.h: #define RETRO_API_VERSION 1
export const RETRO_API_VERSION = 1;

// libretro.h: #define RETRO_ENVIRONMENT_EXPERIMENTAL 0x10000
const RETRO_ENVIRONMENT_EXPERIMENTAL = 0x10000;

// libretro.h: #define RETRO_ENVIRONMENT_SET_MEMORY_MAPS (36 | RETRO_ENVIRONMENT_EXPERIMENTAL)
export const RETRO_ENVIRONMENT_SET_MEMORY_MAPS = 36 | RETRO_ENVIRONMENT_EXPERIMENTAL;

// struct retro_system_info {
//   const char *library_name;
//   const char *library_version;
//   const char *valid_extensions;
//   bool need_fullpath;
//   bool block_extract;
// };
export const RetroSystemInfo = koffi.struct("retro_system_info", {
  library_name: "const char *",
  library_version: "const char *",
  valid_extensions: "const char *",
  need_fullpath: "bool",
  block_extract: "bool",
});

// struct retro_game_info {
//   const char *path;
//   const void *data;
//   size_t size;
//   const char *meta;
// };
export const RetroGameInfo = koffi.struct("retro_game_info", {
  path: "const char *",
  data: "const void *",
  size: "size_t",
  meta: "const char *",
});

// struct retro_memory_descriptor {
//   uint64_t flags;
//   void *ptr;
//   size_t offset;
//   size_t start;
//   size_t select;
//   size_t disconnect;
//   size_t len;
//   const char *addrspace;
// };
// Field order/types confirmed directly against the header source, not inferred.
export const RetroMemoryDescriptor = koffi.struct("retro_memory_descriptor", {
  flags: "uint64_t",
  ptr: "void *",
  offset: "size_t",
  start: "size_t",
  select: "size_t",
  disconnect: "size_t",
  len: "size_t",
  addrspace: "const char *",
});

// struct retro_memory_map {
//   const struct retro_memory_descriptor *descriptors;
//   unsigned num_descriptors;
// };
export const RetroMemoryMap = koffi.struct("retro_memory_map", {
  descriptors: koffi.pointer(RetroMemoryDescriptor),
  num_descriptors: "unsigned int",
});

// Core-callback function pointer types the frontend must supply.
// All use RETRO_CALLCONV, which is __cdecl on Windows (libretro.h line ~57) -
// koffi's default calling convention, so no explicit convention override
// is needed here.
export const RetroEnvironmentCB = koffi.proto("bool RetroEnvironmentCB(unsigned int cmd, void *data)");
export const RetroVideoRefreshCB = koffi.proto(
  "void RetroVideoRefreshCB(const void *data, unsigned int width, unsigned int height, size_t pitch)",
);
export const RetroAudioSampleCB = koffi.proto("void RetroAudioSampleCB(int16_t left, int16_t right)");
export const RetroAudioSampleBatchCB = koffi.proto(
  "size_t RetroAudioSampleBatchCB(const int16_t *data, size_t frames)",
);
export const RetroInputPollCB = koffi.proto("void RetroInputPollCB()");
export const RetroInputStateCB = koffi.proto(
  "int16_t RetroInputStateCB(unsigned int port, unsigned int device, unsigned int index, unsigned int id)",
);

export function loadLibretroCore(corePath) {
  const lib = koffi.load(corePath);

  return {
    lib,
    retro_api_version: lib.func("unsigned int retro_api_version()"),
    retro_get_system_info: lib.func("void retro_get_system_info(_Out_ retro_system_info *info)"),
    retro_set_environment: lib.func("void retro_set_environment(void *cb)"),
    retro_set_video_refresh: lib.func("void retro_set_video_refresh(void *cb)"),
    retro_set_audio_sample: lib.func("void retro_set_audio_sample(void *cb)"),
    retro_set_audio_sample_batch: lib.func("void retro_set_audio_sample_batch(void *cb)"),
    retro_set_input_poll: lib.func("void retro_set_input_poll(void *cb)"),
    retro_set_input_state: lib.func("void retro_set_input_state(void *cb)"),
    retro_init: lib.func("void retro_init()"),
    retro_deinit: lib.func("void retro_deinit()"),
    retro_load_game: lib.func("bool retro_load_game(const retro_game_info *game)"),
    retro_unload_game: lib.func("void retro_unload_game()"),
    retro_run: lib.func("void retro_run()"),
    retro_get_memory_data: lib.func("void *retro_get_memory_data(unsigned int id)"),
    retro_get_memory_size: lib.func("size_t retro_get_memory_size(unsigned int id)"),
  };
}

export function decodeMemoryMap(dataPointer) {
  const map = koffi.decode(dataPointer, RetroMemoryMap);
  if (map.num_descriptors === 0) {
    return [];
  }
  const descriptors = koffi.decode(map.descriptors, RetroMemoryDescriptor, map.num_descriptors);
  return descriptors.map((descriptor) => ({
    ptr: descriptor.ptr,
    offset: Number(descriptor.offset),
    start: Number(descriptor.start),
    len: Number(descriptor.len),
    select: Number(descriptor.select),
    disconnect: Number(descriptor.disconnect),
    addrspace: descriptor.addrspace,
  }));
}
