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
`node_modules`), so the root `npm test` **does** also pick up and run every
`*.test.js` file under `test/`, regardless of this directory's own
`package.json`. This applies to both test files here, but they behave
differently at root:

- `test/address-translate.test.js` has zero external imports (no `koffi`), so
  it runs identically with or without this directory's own `npm install`
  ever having been run, giving the pure address-translation logic free
  coverage in the main CI pipeline.
- `test/libretro-abi.test.js` imports `koffi` to round-trip a synthetic
  memory-map struct through the real FFI decode path. This only resolves
  when this directory's own dependencies are installed (its own
  `node_modules`, found via Node's normal parent-directory module
  resolution). A prior version of this README claimed the koffi-free
  property applied to "the experiment's pure test file" without accounting
  for the possibility of a *second*, koffi-dependent test file being added
  later — which is exactly what happened. To keep that claim true for root
  `npm test` in a genuinely fresh clone (root `npm ci` only, this
  directory's own dependencies never installed), `libretro-abi.test.js`
  guards its own `koffi` import in a try/catch and registers a single,
  clearly-labeled **skipped** test instead of throwing when `koffi` cannot
  be resolved. Verified both ways: with this directory's `node_modules`
  present, root `npm test` runs all 3 real assertions in that file; with it
  removed (simulating a fresh clone), root `npm test` still exits `0`, with
  exactly one skipped test showing why.

`host.mjs` (which also imports `koffi`, unconditionally) is not a
`*.test.js` file and is never auto-discovered by either root or local test
runs.

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

## Process exit and koffi callback cleanup

`host.mjs` wraps its `retro_init`/`retro_load_game`/`retro_run` sequence in a
single `try`/`finally` that always attempts, in order: `retro_unload_game()`
(if a game was loaded), `retro_deinit()` (if `retro_init()` was reached), and
`koffi.unregister()` for every callback the run registered via
`koffi.register()` — each step independently try/caught and recorded in the
printed report's `cleanup` section, so a failure in one does not skip the
others and is never silently swallowed.

While adding this, an isolated minimal repro (`koffi.register()` a single
trivial callback, pass it to nothing, then let the process exit normally)
crashed the Node process with a segmentation fault **100% reproducibly** (5/5
runs) in this environment — Windows, koffi 3.1.4, reproduced identically on
both Node v20.20.2 and v24.15.0, so not a Node-version regression. No koffi
GitHub issue matching this exact shape was found during this task. This is a
real, disclosed, environment-specific finding, not a support claim about
koffi in general.

Critically, **this does not describe `host.mjs`'s actual usage pattern**: all
six callbacks this spike registers are genuinely passed to the core via
`retro_set_environment`/`retro_set_video_refresh`/etc. and the environment
callback is genuinely invoked by native code (9 real calls during
`retro_init()` alone) before the process ever attempts cleanup. Re-running
the real spike against the real official mGBA core five consecutive times
with this cleanup in place produced **exit code 0 every time**, with
`koffi.unregister()` reporting `6/6` callbacks successfully released and zero
errors each run. The practical conclusion carried into the task record: a
callback that has actually been invoked by native code before teardown
appears safe to unregister and exit cleanly in this environment; a callback
that is registered but never invoked is the specific case observed to crash.
This spike's own usage always falls in the first (safe) category, but a
future iteration that ever registers a callback conditionally, without
guaranteeing at least one real native invocation before exit, should treat
this as a known risk, not assume koffi's cleanup path is unconditionally
safe here.

## Tests

`npm test` in this directory runs 15 tests: 12 in
`test/address-translate.test.js` (pure, dependency-free address-translation
logic, no core/ROM required) and 3 in `test/libretro-abi.test.js` (real
`koffi` struct encode/decode round-trips of a synthetic memory map, no core
or ROM required — this exercises `decodeMemoryMap()`'s actual FFI decode
path without the callback-lifecycle risk described above, since it never
calls `koffi.register()`). Both are deliberately separate from the
ABI-calling, callback-registering `host.mjs`, which cannot be meaningfully
unit-tested without a real core and ROM.
