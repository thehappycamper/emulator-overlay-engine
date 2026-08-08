# Implementation Plan

This is the engineering execution sequence: phases with stable IDs, entry/exit criteria, and the tasks that make each phase up. It exists so any agent or human can answer "what phase are we in, what's done, what's blocking, what's next?" from the repository alone.

## Relationship to other documents

- **`docs/project/roadmap.md`** — product-level roadmap: what the product will eventually do, in roughly what order. Coarse-grained, feature-oriented.
- **`docs/project/implementation-plan.md`** (this document) — engineering execution sequence: phases with entry conditions, exit criteria (phase gates), and dependencies. Phase-grained.
- **`docs/tasks/<PhaseID>/`** — individual task records, one per task, with full history (objective, scope, tests, commits, review findings). Task-grained. This is where the actual "what happened" detail lives — this document links to task records rather than repeating their content.
- **`docs/project/last-worked-on.md`** — a short pointer to the current phase, active task(s), and most recently completed task. Not a place for narrative detail.

## Phase status at a glance

| Phase | Name | Status |
| --- | --- | --- |
| `P00` | Initial MVP | completed |
| `P01` | Platform Mapping Foundation | active — `P01-T007` is in independent review |
| `P02` | Domain Boundary | planned |
| `P03` | Semantic Event Foundation | planned |
| `P04` | Event Routing And Actions | planned |
| `P05` | Live Gameplay Source | planned |
| `P06` | Second Source / Domain Proof | planned |
| — | Later Product Tracks | coarse / not phased yet |

---

## P00 — Initial MVP

**Status:** completed

**Objective:** Ship the first static, testable slice: a normalized Pokemon overlay state contract, a dependency-free browser overlay, core damage/capture calculators, tests, CI, and the initial documentation scaffold.

**Entry conditions:** None — starting point.

**Major tasks:**
- [`P00-T001`](../tasks/P00/P00-T001.md) — Initial static MVP.

**Exit criteria (met):**
- `npm test` passes.
- Static overlay renders sample state.
- CI runs on push/PR.
- `AGENTS.md` and initial ADRs (0001–0004) exist.

**Dependencies:** None.

**Out of scope:** Live emulator export, extension/template model, mapping runtime — all deferred to later phases.

---

## P01 — Platform Mapping Foundation

**Status:** active — `P01-T007` is implemented and tested on branch `fix/mapping-array-hardening` (rebased implementation commit `14a66f1`) and is awaiting independent review. This phase closes only after review, explicit merge approval, integration, and post-merge validation.

**Objective:** Build the extension/template/mapping contracts and the safe, non-executable calculated-field model that the future Extension Workbench will author against, while establishing the domain-neutral-core and source-agnostic architectural direction.

**Entry conditions:** `P00` complete.

**Major tasks:**
- [`P01-T001`](../tasks/P01/P01-T001.md) — Scalable extension model. Completed.
- [`P01-T002`](../tasks/P01/P01-T002.md) — Workbench, domain model, templates, and licensing. Completed.
- [`P01-T003`](../tasks/P01/P01-T003.md) — Rename to Emulator Overlay Engine; template schema. Completed.
- [`P01-T004`](../tasks/P01/P01-T004.md) — Implement safe declarative mapping contract. Completed, with one follow-up.
- [`P01-T005`](../tasks/P01/P01-T005.md) — Document event-driven platform vision. Completed.
- [`P01-T006`](../tasks/P01/P01-T006.md) — Clarify source-agnostic platform boundary. Completed.
- [`P01-T007`](../tasks/P01/P01-T007.md) — Harden JSON Pointer array writes. **Review — blocking.**
- [`P01-T008`](../tasks/P01/P01-T008.md) — Establish project task governance and rename strategy. Completed (merged to `main` at `a267950`).
- [`P01-T009`](../tasks/P01/P01-T009.md) — Record Session Referee and verified-environment product vision (ADR 0014). Completed (merged to `main` at `a267950`).

**Exit criteria (phase gate):**
- All of `P01-T001`–`P01-T006` complete. ✅
- `P01-T007` complete: the sparse-array target-write amplification finding from `P01-T004`'s security review is closed, with regression coverage, on `main`. Pending: independent review, explicit merge approval, merge, and post-merge validation. The rebased implementation commit is `14a66f1`.
- `npm test` green after `P01-T007` lands on `main`.

**Dependencies:** `P00`.

**Out of scope (explicitly deferred within this phase, per ADR 0012 and `docs/knowledge/shareable-templates.md`):** Workbench GUI, extension runtime loader/installer, `domains/pokemon/` code migration, live emulator export, mapping-project persistence, template-level embedding of mappings/calculated-fields/fixtures.

---

## P02 — Domain Boundary

**Status:** planned

**Objective:** Extract Pokemon-specific assumptions (currently `src/schemas/overlay-state.schema.json`'s Pokemon-shaped payload, `src/engine/{damage,capture,type-chart}.js`, and `src/overlay/app.js`'s Pokemon-specific rendering) behind a real Pokemon domain boundary, per the direction already recorded in ADR 0008 and `docs/knowledge/domain-extensibility.md`, while keeping shared platform code domain-neutral.

**Entry conditions:** `P01` complete (a stable mapping/target contract should exist before deciding exactly how domain schemas plug into it).

**Major tasks:** Not yet broken into task records — to be created when this phase starts. Expected shape, per `docs/knowledge/domain-extensibility.md`'s sketch: introduce `domains/pokemon/{schemas,engine,overlay-panels}/`, decide whether `overlay-state.schema.json` becomes a thin domain-neutral envelope or moves wholesale into the domain package, and refactor `src/overlay/app.js` into a thin host over domain-registered panels.

**Exit criteria:** Pokemon-specific schema/engine/rendering code lives under a domain boundary; shared platform code (`src/schemas/{extension,template,mapping}.schema.json`, `src/expressions/`, `src/mapping/`) contains no Pokemon-specific assumptions; existing MVP behavior (overlay renders, calculators produce the same results) is preserved and covered by tests.

**Dependencies:** `P01`.

**Out of scope:** A second domain/game (that's `P06`). This phase proves the boundary exists, not that a second domain works through it.

---

## P03 — Semantic Event Foundation

**Status:** planned

**Objective:** Define a normalized, domain-neutral semantic event contract and prove state-transition-to-event detection (`Previous State + Current State → Event Detector → Semantic Event`), per ADR 0013 and `docs/knowledge/product-vision.md`.

**Entry conditions:** `P01` complete (event targets should be provable against the existing mapping/target-descriptor contract, per the "additive, not breaking" compatibility analysis in `P01-T004`'s review). `P02` is not a hard prerequisite but is likely to inform where event *interpretation* lives (domain vs. platform).

**Major tasks:** Not yet broken into task records. ADR 0013 explicitly reserves the event schema, detector API, event bus, subscription model, action schema, session protocol, transport, and persistence model for separate future decisions — this phase is where the first of those (the event schema + detection proof) gets designed and implemented.

**Exit criteria:** A normalized event contract exists (schema); at least one concrete state-transition-to-event detection is proven end-to-end with tests (e.g. a Pokemon badge-earned style transition); no arbitrary-code-execution path introduced (same constraint as `P01-T004`'s mapping/calculated-field work).

**Dependencies:** `P01`.

**Out of scope:** Do not design the event schema as part of any governance/planning task — this plan only reserves the phase. Event routing, subscriptions, and actions are `P04`.

---

## P04 — Event Routing And Actions

**Status:** planned

**Objective:** Prove event subscriptions/routing and a minimal action contract (e.g. an event triggering an overlay update or a single action-provider example) without building broad integrations (no OBS/MQTT/hardware integrations yet — those are later product tracks).

**Entry conditions:** `P03` complete.

**Major tasks:** Not yet broken into task records.

**Exit criteria:** A minimal, provable path from a detected event to a subscriber-triggered action exists, with a documented action-provider contract narrow enough to extend later without a breaking change.

**Dependencies:** `P03`.

**Out of scope:** Broad action-provider ecosystem (audio, OBS, HTTP/webhooks, MQTT, hardware bridges) — those are Later Product Tracks, built on the contract this phase proves, not built by this phase.

---

## P05 — Live Gameplay Source

**Status:** planned

**Objective:** Implement the first live source integration — the Gen 3 mGBA adapter sketched in `adapters/gen3-mgba/README.md` and `docs/project/roadmap.md`'s "First Real Live Integration" — against the source-agnostic platform boundary clarified in `P01-T006`.

**Entry conditions:** `P01` complete (source contract + mapping pipeline must exist to map live source data into normalized state). Does not strictly require `P02`/`P03`/`P04`, but should route through the mapping pipeline (`P01-T004`) rather than hand-writing normalized state, per `docs/knowledge/adapter-contracts.md`.

**Major tasks:** Not yet broken into task records. Roadmap deliverables: `adapters/gen3-mgba` Lua exporter, overlay option for `live-state.json`, emulator setup documentation, tests for exported sample fixtures.

**Exit criteria:** Live party/opponent/seed/frame/bag/map data flows from mGBA through a source contract and mapping project into normalized state, rendered by the existing overlay.

**Dependencies:** `P01`.

**Out of scope:** A second emulator/source (that's part of `P06`'s proof, if a second source is chosen over a second domain).

---

## P06 — Second Source / Domain Proof

**Status:** planned

**Objective:** Prove the architecture is not accidentally Pokemon-specific or emulator-specific by exercising it against a second source and/or domain. The exact choice does not need to be made now.

**Entry conditions:** `P02` and `P05` complete (need both a real domain boundary and a real first live source to prove a second one doesn't require platform changes).

**Major tasks:** Not yet broken into task records; not yet scoped beyond "prove it."

**Exit criteria:** A second source or domain works through the existing platform contracts (extension, mapping, and — if `P02`/`P05` order allows — domain boundary) without platform-layer changes beyond what the contracts already allow.

**Dependencies:** `P02`, `P05`.

**Out of scope:** Deciding the second domain/source now — per instruction, this is intentionally left open.

---

## Later Product Tracks (not yet phased)

Kept coarse until the earlier contracts above are proven, per `docs/project/roadmap.md`'s "Subsequent Product Tracks": Extension Workbench GUI, richer Pokemon assistant functionality (battle projections, route/capture support, scoring, facility set identification, move prediction), local automation and action providers, local sessions/rules, a Session Referee capable of declaring/negotiating/verifying/enforcing session environments (game/version/hash/seed/ruleset/modification-set), a reviewed game-modification registry with explicit user-authorized activation, optional hosted services ("EOE Cloud" in current product-vision naming — see `docs/project/branding-and-renaming.md`), matchmaking and community features, and marketplace/commercial services. Full detail on the Session Referee/verified-environments direction is in `docs/knowledge/product-vision.md`'s "Session Referee And Verified Environments" section and ADR 0014 — it depends on events (`P03`), actions (`P04`), and source/provider capability advertisement (not yet phased), so it is not pulled into the near-term `P02`–`P06` sequence. These will be broken into phases (`P07`+) once the contracts they build on (`P02`–`P06`) are proven — assigning IDs and task records to them now would be planning ahead of the evidence this repository is built to require.

## Updating this plan

- When a task completes, update its status in the relevant `docs/tasks/<PhaseID>/<TaskID>.md` file — do not duplicate that detail here.
- When all of a phase's exit criteria are met, update that phase's **Status** here and in the table at the top, and update `docs/project/roadmap.md` if the product-level framing also changes.
- When a new phase starts, break it into task records under `docs/tasks/<PhaseID>/` as work is scoped — this document does not need every task pre-created before a phase begins.
