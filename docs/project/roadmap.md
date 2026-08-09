# Roadmap

This is the product-level roadmap: what the product will eventually do, roughly in what order. For the engineering execution sequence — phases with stable IDs, entry/exit criteria, and dependencies — see [`docs/project/implementation-plan.md`](implementation-plan.md). For task-by-task history, see [`docs/tasks/`](../tasks/README.md).

## Completed

### Static MVP

Status: complete.

- Normalized state schema.
- Static browser overlay.
- Basic damage and capture calculators.
- Tests and CI.

### Safe Mapping Foundation

Status: complete.

- Domain-neutral mapping-project schema with named/versioned source and target contracts.
- Direct field mappings and ID/value mappings.
- Safe JSON expression AST and deterministic evaluator.
- Executable mapping pipeline with required-path checks and target validation hook.
- Automated schema validation for public examples and fixtures.

This foundation does not include the Workbench GUI, live emulator export, event processing, sessions, multiplayer, or a runtime extension installer.

### Pokemon Domain Boundary Proof

Status: complete. `P02` — Domain Boundary is closed.

- Domain-neutral registry with explicit application composition.
- Pokemon-owned type, damage, and capture calculators under `src/domains/pokemon/`.
- Pokemon-owned normalized-state contract with a compatibility alias for the former platform path.
- Existing calculator imports preserved through compatibility re-exports.
- Pokemon-owned static overlay rendering and styles through a domain-neutral browser host.
- Domain-extensible semantic UI slot identifiers with legacy unqualified values preserved.

## Near-Term Platform Foundation

These are the intended next architecture slices. Each requires separate approval, design, tests, and documentation; none is implemented by this roadmap update.

1. State/source pipeline stabilization.
2. Normalized event contract and semantic event-detection proof.
3. Event bus and action-contract proof.

## First Real Live Integration

### Live Gen 3 mGBA Export

Status: live integration active. `P05-T002` proved acquisition, `P05-T003` defines/emits the source contract, `P05-T004` completed fixed-slot mapping plus validated atomic normalized-state delivery, and `P05-T005`/`P05-T006` completed the gitignored local launcher plus supported savestate automation. Real mGBA end-to-end smoke and richer fields remain.

Goal:

- Export party, active opponent, seed/frame, bag balls/TMs, and map ID from mGBA Lua into normalized JSON.

Deliverables:

- Thin mGBA provider composed with the game-owned Emerald acquisition package.
- Named/versioned adapter-owned acquisition source contract and safe local snapshot handoff (`P05-T003`, completed).
- Declarative fixed-slot mapping, canonical target validation, and atomic `public/live-state.json` handoff (`P05-T004`, completed).
- Local `.env.local` setup and Windows-friendly mGBA launcher (`P05-T005`, completed), with supported savestate auto-loading (`P05-T006`, completed).
- Overlay option for `live-state.json` with continuous refresh (`P05-T001`, completed: the overlay polls its state source, re-renders on change, and tolerates a missing/invalid/partial file — see [`docs/tasks/P05/P05-T001.md`](../tasks/P05/P05-T001.md)).
- Documentation for emulator setup.
- Tests for exported sample fixtures.

## Subsequent Product Tracks

These are future tracks, not committed implementation slices:

- A second-emulator proof using BizHawk 2.11.1. Local auto-launch is implemented and the provider-neutral Emerald contract/mapping/domain/overlay reuse slice is in review; real-ROM operator acceptance remains required.

- Richer Pokemon assistant functionality: battle projections, route/capture support, scoring, facility set identification, and move prediction.
- Extension Workbench for mapping and later event/rule/action authoring through reviewable contracts.
- Local automation and extensible action providers.
- Optional interoperability with general-purpose workflow systems through generic event/action surfaces; EOE retains game semantics and safe execution.
- Local sessions and rules for cooperative, competitive, asynchronous, and cross-domain experiences.
- Ruleset-defined normalized progress, progression graphs, and common session results without a universal scoring formula.
- Domain-aware location/map capabilities, kept separate from route/dependency progression graphs.
- A Session Referee that declares, negotiates, verifies, and (where supported) enforces the shared session environment, plus a reviewed game-modification registry — see `docs/knowledge/product-vision.md` and ADR 0014.
- A second game/domain proof.
- Optional EOE Cloud sessions, synchronization, spectator experiences, and persistence.
- Matchmaking and community features, kept separate from session/rules behavior.
- Marketplace and other hosted commercial services around the MIT-licensed core.

The canonical direction for progress, spatial capabilities, scoring/results, cross-domain competition, and external workflow interoperability is in `docs/knowledge/product-vision.md` and ADR 0016. These entries do not define contracts or commit implementation dates.
