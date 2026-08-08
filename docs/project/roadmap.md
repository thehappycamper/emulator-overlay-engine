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

Status: complete.

- Domain-neutral registry with explicit application composition.
- Pokemon-owned type, damage, and capture calculators under `src/domains/pokemon/`.
- Existing calculator imports preserved through compatibility re-exports.
- Pokemon state-schema and overlay-panel migration intentionally deferred.

## Near-Term Platform Foundation

These are the intended next architecture slices. Each requires separate approval, design, tests, and documentation; none is implemented by this roadmap update.

1. State/source pipeline stabilization.
2. Normalized event contract and semantic event-detection proof.
3. Event bus and action-contract proof.

## First Real Live Integration

### Live Gen 3 mGBA Export

Goal:

- Export party, active opponent, seed/frame, bag balls/TMs, and map ID from mGBA Lua into normalized JSON.

Deliverables:

- `adapters/gen3-mgba` Lua exporter.
- Overlay option for `live-state.json`.
- Documentation for emulator setup.
- Tests for exported sample fixtures.

## Subsequent Product Tracks

These are future tracks, not committed implementation slices:

- Richer Pokemon assistant functionality: battle projections, route/capture support, scoring, facility set identification, and move prediction.
- Extension Workbench for mapping and later event/rule/action authoring through reviewable contracts.
- Local automation and extensible action providers.
- Local sessions and rules for cooperative, competitive, and asynchronous experiences.
- A Session Referee that declares, negotiates, verifies, and (where supported) enforces the shared session environment, plus a reviewed game-modification registry — see `docs/knowledge/product-vision.md` and ADR 0014.
- A second game/domain proof.
- Optional EOE Cloud sessions, synchronization, spectator experiences, and persistence.
- Matchmaking and community features, kept separate from session/rules behavior.
- Marketplace and other hosted commercial services around the MIT-licensed core.
