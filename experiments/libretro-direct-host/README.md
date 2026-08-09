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

- **Video refresh, audio sample(s), input poll/state:** no-op stubs, each
  incrementing its own counter in `host.mjs`'s printed report
  (`callbackInvocationCounts`) so the report is real evidence of which
  callbacks native code actually invoked, not a claim taken on faith. The
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
- **A rejected (non-ROM) run never reaches `retro_run()`, never receives
  `SET_MEMORY_MAPS`, and never attempts a memory read.** This is not just
  asserted in the console message printed on rejection — the printed report
  proves it: `retroRunInvoked` is `false`, `memoryMap` is `null`, and
  `callbackInvocationCounts` shows the environment callback invoked (9 times
  against the real core, for the commands it issues during `retro_init()`)
  while `videoRefresh`/`audioSample`/`audioSampleBatch`/`inputPoll`/
  `inputState` all remain `0`, because those callbacks are only ever called
  by a core from inside `retro_run()`, which a rejected load never reaches.
- **First-descriptor-claims precedence:** per libretro.h, "if multiple
  memory descriptors can claim a particular byte, the first one defined in
  the retro_memory_descriptor array applies" — including when that first
  descriptor has no backing pointer (`ptr: NULL`, libretro's documented way
  to say "no accessible memory here"). `address-translate.mjs` honors this
  exactly: it never falls through an inaccessible first match to a later,
  possibly-accessible, overlapping descriptor. See
  `matchDescriptorForAddress`/`findDescriptorForAddress`/`readAddress` and
  the "first-descriptor-claims precedence" tests in
  `test/address-translate.test.js`.
- **Out of scope: `len: 0` (borderless) descriptors.** libretro.h documents
  a zero `len` as meaning a descriptor is "bounded only by select/disconnect"
  rather than a fixed size. This spike's translation logic cannot express
  that (an unsigned `reduced < len` comparison can never be true when
  `len` is `0`, so such a descriptor can never match, for any address) -
  this matches RetroArch's own reference behavior for the same input, not a
  gap this module introduces, and real GBA descriptors (mGBA's own
  registration, confirmed against its source) always specify a concrete
  `len`, so this spike does not need to support the borderless case. Pinned
  by a dedicated test rather than left as an unstated side effect.
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

## API version gate, callback lifecycle, and cleanup

`host.mjs` calls `retro_api_version()` as the very first ABI call after
loading the core and fails closed immediately on a mismatch — before
`retro_get_system_info()`, before any `koffi.register()` call, before any
`retro_set_*` call. A core reporting an unexpected API version is not one
this spike (or a real integration) can safely assume ABI compatibility with
for any of those later calls.

Callback registration itself (all six `koffi.register()` calls, plus every
`retro_set_*` call that wires them into the core) lives inside the same
`try` block as `retro_init`/`retro_load_game`/`retro_run`, with a single
`finally` covering the whole lifecycle. `registeredCallbacks` is tracked
outside the `try` and appended to immediately as each registration
succeeds, so if execution never gets past registration at all (an
`retro_api_version()` mismatch throws with zero callbacks registered) or
stops partway through it (a later registration call throws with some
callbacks already registered), the `finally` block still unregisters
exactly what was actually registered so far - not nothing, and not
everything. The same `finally` also always attempts, in order:
`retro_unload_game()` (if a game was loaded) and `retro_deinit()` (if
`retro_init()` was reached) - each step independently try/caught and
recorded in the printed report's `cleanup` section, so a failure in one
does not skip the others and is never silently swallowed.

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

`npm test` in this directory runs 19 tests: 16 in
`test/address-translate.test.js` (pure, dependency-free address-translation
logic, no core/ROM required - including first-descriptor-claims precedence
with overlapping descriptors, and the `len: 0` out-of-scope case) and 3 in
`test/libretro-abi.test.js` (real `koffi` struct encode/decode round-trips
of a synthetic memory map, no core or ROM required — this exercises
`decodeMemoryMap()`'s actual FFI decode path without the callback-lifecycle
risk described above, since it never calls `koffi.register()`). Both are
deliberately separate from the ABI-calling, callback-registering
`host.mjs`, which cannot be meaningfully unit-tested without a real core
and ROM.
