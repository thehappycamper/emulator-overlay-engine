# Libretro Direct-Host Feasibility Spike (P05-T007)

Determines empirically whether EOE can directly host the mGBA libretro core
and read Pokemon Emerald memory through the official libretro ABI, without
RetroArch, Lua, emulator GUI automation, or process-memory hooking.

**This is a feasibility spike, not the start of a production emulator
frontend.** See `docs/tasks/P05/P05-T007.md` for the full evidence report and
decision. Do not treat a successful run as production readiness.

## Isolation from the rest of the repository

This directory has its own `package.json` and dependency (`koffi`, an
FFI/native-library-calling package). It is **not** referenced by the root
`package.json`, and installing it (`npm install` inside this directory) adds
no dependency to the rest of the project. Run the spike itself
(`npm run spike`) from inside this directory.

One exception, confirmed by testing rather than assumed: Node's built-in test
runner discovers `**/*.test.js` files recursively by default (excluding
`node_modules`), so the root `npm test` **does** also pick up and run
`test/address-translate.test.js` — this is intentional and harmless, not
cross-contamination: that file has zero external imports (no `koffi`), so it
runs identically with or without this directory's own `npm install` ever
having been run, and gives the pure address-translation logic free coverage
in the main CI pipeline. `host.mjs` (the only file that imports `koffi`) is
not a `*.test.js` file and is never auto-discovered.

## What this does and does not do

Implements only the libretro callback plumbing required for `retro_init` /
`retro_load_game` / `retro_run` to complete without crashing, and to observe
`RETRO_ENVIRONMENT_SET_MEMORY_MAPS`:

- **Video refresh, audio sample(s), input poll/state:** no-op stubs. The
  libretro ABI requires these to be registered before `retro_init()` (cores
  may call `retro_set_environment`'s callback, which can query things like
  pixel format, before or during init) — mGBA's core did not fail or block
  when they were declined/no-op'd during this spike's testing. If a future
  iteration finds a specific core requires real frame data to proceed past
  a certain point, that would be documented here and in the task record;
  this spike found no such requirement for reaching `retro_run()`.
- **Environment callback:** only handles `RETRO_ENVIRONMENT_SET_MEMORY_MAPS`;
  every other command (pixel format, input descriptors, log interface,
  variables, VFS interface, etc.) is declined by returning `false`, which is
  a documented, valid response for a core to receive.
- Does **not** implement: real video/audio output, controller
  configuration, a core downloader, shaders, achievements, netplay, a game
  library, general settings, or any packaging — all explicitly out of scope
  per the task.

## Setup

```powershell
Copy-Item .env.local.example .env.local
# Edit .env.local: point LIBRETRO_CORE_PATH at a locally obtained mGBA
# libretro core, and EMERALD_ROM_PATH at a legally obtained Emerald Rev 0 ROM.
npm install
npm run spike
```

## Save-state / known-state limitation

The task considered directly loading the project's existing mGBA `.ss0`
savestate to get the core into a known, deterministic test state (matching
the fixture values already used in `adapters/gen3-mgba/fixtures/`). **This
was not attempted and is not implemented here.** libretro's savestate format
(`retro_serialize`/`retro_unserialize`) is a core-private opaque blob with no
guaranteed relationship to a standalone mGBA GUI build's own savestate file
format — even though both ultimately wrap the same libmgba, the libretro
core's serialization wrapper is not documented as bit-compatible with
standalone mGBA's `.ss0`/`.ss1` format, and forcing compatibility (e.g. by
byte-patching one into the other) would be exactly the kind of hack this
task was told not to build. The deterministic-state question is therefore
still open; the smallest safe next step would be for the libretro core
itself to produce its own state file (via `retro_serialize`) after manual
play, then reload that — not to reuse mGBA's own `.ss0`. This spike instead
reads memory immediately after a fixed number of `retro_run()` calls from
power-on, which is deterministic but not a specific in-game situation.

## Tests

`npm test` in this directory runs only the pure, dependency-free
`address-translate.mjs` tests (no core/ROM required, no `koffi` import).
This is deliberately separate from the ABI-calling `host.mjs`, which cannot
be meaningfully unit-tested without a real core and ROM.
