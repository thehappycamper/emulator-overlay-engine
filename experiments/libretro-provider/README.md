# Libretro Provider Prototype (P05-T013)

This isolated experiment runs an arbitrary native Libretro core in a child Node process. The parent process uses a versioned JSON-lines IPC protocol and never loads the native library or Koffi.

## Boundary

```text
EOE process
  -> provider client / JSON-lines IPC
  -> provider child
  -> Libretro core / callbacks / memory
```

The child owns core loading, ABI checks, callback registration, content loading, memory-map discovery, frame execution, and teardown. The parent owns request timeouts, child lifecycle observation, and structured error propagation. No Pokemon, Emerald, mapping, normalized-state, or overlay behavior exists in this prototype.

## Protocol

Requests are newline-delimited JSON objects with a string `id`, operation `op`, and `params`. Responses are `{id, ok, result}` or `{id, ok: false, error: {code, message}}`. Protocol version is `1.0.0`.

Supported operations:

| Operation | Purpose |
| --- | --- |
| `initialize` | Load a core and content path, validate ABI 1, advertise identity/capabilities, and publish memory regions. A single bootstrap frame is executed because some cores publish maps on their first frame. |
| `read8`, `read16`, `read32` | Read little-endian values from a discovered region and bounded offset. |
| `readRange` | Read up to 1 MiB and return base64 bytes. |
| `run` | Execute 1 to 10,000 frames. |
| `shutdown` | Unload content, deinitialize the core, unregister callbacks, and exit the child. |

Memory reads are region-relative and use the descriptor's published bounds. Unknown, inaccessible, or out-of-range regions fail with structured errors. The IPC boundary is intentionally local and unauthenticated; it is not a network protocol or a production plugin installer.

## Local validation

```powershell
npm install
npm test
```

For a real local experiment, use the existing official-core configuration convention from `experiments/libretro-direct-host/.env.local`, then call `LibretroProviderClient` from a small local script. Do not commit ROMs, saves, savestates, BIOS files, or core binaries.

## Explicit non-goals

This task does not add writes, savestates, controller input, audio/video presentation, core discovery/updating, achievements, netplay, overlay integration, or a production emulator frontend. The existing direct-host experiment remains the historical feasibility record; this directory is the first child-process provider boundary.
