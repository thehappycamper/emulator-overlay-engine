# Last Worked On

This is a short pointer, not the project history. For full history, see `docs/tasks/**` (task-by-task record) and `docs/project/implementation-plan.md` (phase status/gates). Git history and ADRs remain authoritative for exact commits and architectural decisions.

## Current status

- **Active phase:** `P05` — Live Gameplay Source. `P03` and `P04` remain planned and unstarted; phase numbering and dependencies are unchanged. See [implementation plan](implementation-plan.md).
- **Active task:** [`P05-T005` — Add Emerald Proof 1 local configuration and launcher](../tasks/P05/P05-T005.md), implemented on `feat/P05-T005-emerald-local-launcher` and awaiting independent review.
- **Last completed task:** [`P05-T004` — Map Emerald acquisition into Pokemon live state](../tasks/P05/P05-T004.md) (2026-08-08, independent review APPROVE, merged at `f301d6b`). [`P05-T001`](../tasks/P05/P05-T001.md), [`P05-T002`](../tasks/P05/P05-T002.md), and [`P05-T003`](../tasks/P05/P05-T003.md) are also completed.
- **Next P05 step:** independently review `P05-T005`, then run and record the first real mGBA end-to-end acceptance test using the simplified launcher workflow. Broader phase-gate acquisition/mapping (whole party, moves/bag, seed/frame, species/map lookup data) remains after that smoke. `P05` remains active.

## Most recent session (2026-08-08)

`P05-T005` adds a non-executable `.env.local` parser, path/setup validation, output-directory preparation, and `npm run proof:emerald`. The launcher passes source snapshot configuration into the new mGBA child, starts the configured ROM, and prints manual savestate/Lua plus mapper/server commands. It does not automate mGBA GUI actions, inspect/copy game assets, or change source/mapping/runtime contracts.

`P05-T004` adds the checked-in mapping from `pokemon.emerald.us-rev0.mgba.acquisition@1.0.0` to `pokemon.overlay-state@0.1.0`, uses explicit placeholders for unavailable required fields, validates the canonical target through `applyMappingProject()`, and atomically publishes `public/live-state.json` through `npm run live:emerald`. Independent review hand-traced the mapping's placeholder/collapse logic, independently reproduced its output, independently proved fail-closed behavior end-to-end via the real CLI against a corrupted source (byte-identical output file before/after), and independently proved the mapped output renders safely through the real Pokemon renderer; verdict APPROVE, no blocking findings, merged by fast-forward. This completes the initial local source-to-overlay code path; real mGBA smoke and broader phase-gate fields remain before `P05` can close.

`P05-T001` replaced the overlay's one-shot state load with a domain-neutral polling controller that prevents overlapping fetches, renders only changed JSON-derived state, preserves the last good render through missing/truncated state files, and reports `live`/`stale`/`error`. Independent review reproduced HP changes, truncated-JSON staleness, recovery, and default sample-state rendering against the real controller/dev-server path; verdict APPROVE, no blocking findings. Its integration was reconciled with the concurrently completed `P05-T002` acquisition proof.

`P02-T006` (earlier session) moved Pokemon markup, state interpretation, calculator-backed projections, and styles into the Pokemon package, closing `P02` — Domain Boundary.

For the prior session (governance/branding/task-system establishment, Session Referee product vision, and `P01-T007`'s merge that closed `P01`), see `docs/tasks/P01/P01-T007.md`, `docs/tasks/P01/P01-T008.md`, and `docs/tasks/P01/P01-T009.md`.

## Updating this file

Update the **Current status** section whenever active phase/task changes. Do not add narrative session detail here — put it in the relevant task record under `docs/tasks/<PhaseID>/` instead, and link to it from this file if it's worth surfacing as "most recent session."
