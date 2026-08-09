# Last Worked On

This is a short pointer, not the project history. For full history, see `docs/tasks/**` (task-by-task record) and `docs/project/implementation-plan.md` (phase status/gates). Git history and ADRs remain authoritative for exact commits and architectural decisions.

## Current status

- **Active phases:** `P05` — Live Gameplay Source remains open for real mGBA acceptance and richer acquisition. `P06` has a narrowly approved parallel BizHawk bootstrap task; this does not waive the `P05` gate or complete the second-source proof. `P03` and `P04` remain planned and unstarted. See [implementation plan](implementation-plan.md).
- **Current review task:** [`P06-T001` — BizHawk Proof 2 launcher/bootstrap](../tasks/P06/P06-T001.md) adds local-only setup, automatic ROM/savestate/Lua launch, and strict identity/frame diagnostics. It does not yet emit a source contract or normalized state.
- **Last completed task:** [`P05-T006` — Automate Emerald Proof 1 savestate loading via mGBA's CLI](../tasks/P05/P05-T006.md) (2026-08-08, independent review APPROVE, fast-forward merged at `aa5d97b`). [`P05-T001`](../tasks/P05/P05-T001.md) through [`P05-T005`](../tasks/P05/P05-T005.md) are also completed.
- **Next P05 step:** run and record the first real mGBA end-to-end acceptance test using `npm run proof:emerald` (config validation, mGBA launch, and savestate loading are automated; Lua loading and the printed mapper/dev-server terminal commands remain manual). Broader phase-gate acquisition/mapping (whole party, moves/bag, seed/frame, species/map lookup data) remains after that smoke. `P05` remains active.

## Most recent session (2026-08-08)

`P05-T006` investigated mGBA's actual documented capabilities rather than continuing to assume none existed: confirmed via the mGBA maintainers' own "closed as not planned" resolution of [mgba-emu/mgba#3289](https://github.com/mgba-emu/mgba/issues/3289) that Lua-script auto-loading has no supported non-GUI path, but found `mgba-qt` officially documents a `--savestate` command-line flag that `P05-T005` wasn't using. Savestate loading is now automated via that flag; script loading remains manual. Independent review verified the exact mGBA 0.10.3 parser, Windows option permutation, Qt load path, paths-with-spaces argument handoff, optional behavior, and fail-before-spawn validation; verdict APPROVE and fast-forward merged.

`P05-T005` adds a non-executable `.env.local` parser, path/setup validation, output-directory preparation, and `npm run proof:emerald`. The launcher passes source snapshot configuration into the new mGBA child, starts the configured ROM, and prints manual savestate/Lua plus mapper/server commands. It does not automate mGBA GUI actions, inspect/copy game assets, or change source/mapping/runtime contracts. Independent review directly proved environment inheritance by running the launcher against a real Node.js stand-in for mGBA that reported its own inherited environment (not just unit tests), confirmed gitignore coverage by creating real `.env.local`/`.env.*.local` files, and confirmed `--check` mode never spawns a process; verdict APPROVE, two disclosed non-blocking notes (a Node.js launcher rather than PowerShell, and only mGBA is auto-launched rather than all three processes), merged by fast-forward.

`P05-T004` adds the checked-in mapping from `pokemon.emerald.us-rev0.mgba.acquisition@1.0.0` to `pokemon.overlay-state@0.1.0`, uses explicit placeholders for unavailable required fields, validates the canonical target through `applyMappingProject()`, and atomically publishes `public/live-state.json` through `npm run live:emerald`. Independent review hand-traced the mapping's placeholder/collapse logic, independently reproduced its output, independently proved fail-closed behavior end-to-end via the real CLI against a corrupted source (byte-identical output file before/after), and independently proved the mapped output renders safely through the real Pokemon renderer; verdict APPROVE, no blocking findings, merged by fast-forward. This completes the initial local source-to-overlay code path; real mGBA smoke and broader phase-gate fields remain before `P05` can close.

`P05-T001` replaced the overlay's one-shot state load with a domain-neutral polling controller that prevents overlapping fetches, renders only changed JSON-derived state, preserves the last good render through missing/truncated state files, and reports `live`/`stale`/`error`. Independent review reproduced HP changes, truncated-JSON staleness, recovery, and default sample-state rendering against the real controller/dev-server path; verdict APPROVE, no blocking findings. Its integration was reconciled with the concurrently completed `P05-T002` acquisition proof.

`P02-T006` (earlier session) moved Pokemon markup, state interpretation, calculator-backed projections, and styles into the Pokemon package, closing `P02` — Domain Boundary.

For the prior session (governance/branding/task-system establishment, Session Referee product vision, and `P01-T007`'s merge that closed `P01`), see `docs/tasks/P01/P01-T007.md`, `docs/tasks/P01/P01-T008.md`, and `docs/tasks/P01/P01-T009.md`.

## Updating this file

Update the **Current status** section whenever active phase/task changes. Do not add narrative session detail here — put it in the relevant task record under `docs/tasks/<PhaseID>/` instead, and link to it from this file if it's worth surfacing as "most recent session."
