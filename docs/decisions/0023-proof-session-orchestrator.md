# ADR 0023: Reusable Local Proof-Session Orchestrator

Date: 2026-08-09

Status: accepted

Implements: ADR 0020

## Context

The BizHawk Emerald proof already existed as three separately-run, already-reviewed pieces: `npm run proof:bizhawk` (validate config, launch BizHawk with the connector), `npm run live:emerald` (watch the acquisition source snapshot, apply the checked-in mapping, publish normalized state), and `npm start` (serve the overlay). Running a proof session required three manually coordinated PowerShell terminals, each started with hand-copied environment assignments the first launcher printed. This is real, avoidable operator friction on the same real-ROM acceptance path every `P05`/`P06` task in this phase has depended on.

The mGBA path has the same three-process shape (launcher, mapper, server), and a future Libretro provider (`P05-T007`, still an unmerged feasibility spike, not depended on here) will need equivalent process lifecycle management once it reaches production. Building a BizHawk-only script would either get rebuilt per provider or slowly grow BizHawk-specific process-management code that has nothing to do with BizHawk.

## Decision

Split the work into two layers:

**`tools/proof-session.mjs`** - a reusable, emulator-agnostic primitive with no Pokemon/Emerald/BizHawk/mGBA knowledge of any kind. Given a list of child-process specifications (command/args/env, a readiness signal, criticality), it: spawns them in order, each gated on the previous one's own readiness signal (either "the OS confirmed the process started," for processes with no meaningful startup output like a GUI emulator, or a matched stdout/stderr line, for processes with real startup logging); prefixes streamed output with `[label]`; checks TCP port availability via a real throwaway-socket bind/close, not a guess; and owns termination - a manual `terminate()` call (wired to `SIGINT`/`SIGTERM` by the caller), a child failing to start, or a *critical* child exiting unexpectedly after startup all trigger the same coordinated shutdown of every other tracked child. Every child is tracked by its own `ChildProcess` object and terminated by calling `.kill()` on that exact object (which operates by PID) - never by an executable-name-based kill, which would risk terminating unrelated processes that happen to share a name.

**`tools/proof-emerald-bizhawk.mjs`** - the small, BizHawk-specific composition, run via the new `npm run proof:emerald:bizhawk` script. It reuses `bizhawk-proof-config.mjs` (`loadBizHawkProofConfig`/`validateBizHawkProofConfig`/`prepareBizHawkProofDirectory`/`createBizHawkLaunch`) completely unmodified for config loading, validation, and BizHawk launch-descriptor construction, and reuses the existing `tools/emerald-live-state.mjs`/`tools/dev-server.mjs` scripts unmodified as the mapper/server children. It builds three child specs - `bizhawk` (`ready: "spawn"`, `captureOutput: false`, since a GUI emulator's Lua console writes to its own panel, not this process's stdout - a disclosed limitation, not a claim that the connector has loaded), `mapper` (`ready` matched against the mapper's own existing `"Watching Emerald source snapshot:"` log line), `server` (`ready` matched against the server's own existing `"running at http://"` log line) - all sharing the single `environment` object `createBizHawkLaunch()` already produces, so snapshot/live-state/poll-interval/port configuration is never duplicated or re-derived.

**Port-conflict policy: fail closed, no automatic port selection.** A URL printed for a port the operator did not configure would be a real source of confusion, and `PORT` is already a one-line change in `.env.bizhawk.local`. `--check` validates configuration, file existence, and port availability without spawning anything.

**Windows process-lifecycle note.** Unlike POSIX, a non-detached Node child process is not automatically terminated when its parent exits, and Windows has no real SIGTERM/SIGKILL distinction - `ChildProcess#kill()` maps to `TerminateProcess()`, which is already immediate. Every child is therefore explicitly tracked and explicitly killed during shutdown; nothing relies on implicit OS process-group cleanup.

The existing individual commands (`npm run proof:bizhawk`, `npm run live:emerald`, `npm start`) are unmodified and remain available for diagnostics (e.g. iterating on the mapper without relaunching BizHawk).

## Consequences

- The one-command BizHawk proof-session workflow is `npm run proof:emerald:bizhawk` (`-- --check` to validate only).
- `tools/proof-session.mjs` has no BizHawk/mGBA/Libretro knowledge and is the intended shared machinery for a future `proof:emerald:mgba` and (only once `P05-T007`'s live-ROM proof succeeds and a production Libretro provider is separately scoped and designed) `proof:emerald:libretro` - neither is built by this task.
- `npm run proof:emerald` (the existing mGBA launcher name, predating this task) is left unrenamed; harmonizing mGBA's script name with the `proof:emerald:<provider>` pattern is a follow-up, not a breaking rename bundled into this task.
- BizHawk's own real startup/connector-load evidence (beyond "the OS started the process") is still only obtainable from BizHawk's own Lua console during a real operator session - this task does not change what the real-ROM acceptance gate for `P05`/`P06` requires.
