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
| `P01` | Platform Mapping Foundation | completed |
| `P02` | Domain Boundary | completed |
| `P03` | Semantic Event Foundation | planned |
| `P04` | Event Routing And Actions | planned |
| `P05` | Live Gameplay Source | active - `P05-T001`-`T006`, `T009` completed; `T010` in review; `T011` scoped; real mGBA/BizHawk end-to-end acceptance still required |
| `P06` | Second Source / Domain Proof | active (provider-neutral acquisition implemented and reviewed; real-ROM BizHawk acceptance and `P05` gate remain open) |
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

**Status:** completed. Closed at `main@f1cc577` (fast-forward merge of `fix/mapping-array-hardening`, independent review verdict APPROVE, project-owner merge approval granted, post-merge validation passed).

Summary of what `P01` delivered: a domain-neutral, safe declarative mapping contract (`src/schemas/mapping.schema.json`) with a pure expression evaluator that remains non-executable (no `eval`/`Function`/dynamic import/host-global access — ADR 0012); automated schema validation for extension, template, mapping, and normalized-state examples (`npm test`); the sparse-array target-write amplification finding closed with regression coverage (`P01-T007`); and the governance/brand-agnostic/source-agnostic/product-vision foundation (`docs/project/branding-and-renaming.md`, `docs/tasks/`, `docs/knowledge/product-vision.md`, ADRs 0013–0014) that all later phases build on.

**Objective:** Build the extension/template/mapping contracts and the safe, non-executable calculated-field model that the future Extension Workbench will author against, while establishing the domain-neutral-core and source-agnostic architectural direction.

**Entry conditions:** `P00` complete.

**Major tasks:**
- [`P01-T001`](../tasks/P01/P01-T001.md) — Scalable extension model. Completed.
- [`P01-T002`](../tasks/P01/P01-T002.md) — Workbench, domain model, templates, and licensing. Completed.
- [`P01-T003`](../tasks/P01/P01-T003.md) — Rename to Emulator Overlay Engine; template schema. Completed.
- [`P01-T004`](../tasks/P01/P01-T004.md) — Implement safe declarative mapping contract. Completed, with one follow-up.
- [`P01-T005`](../tasks/P01/P01-T005.md) — Document event-driven platform vision. Completed.
- [`P01-T006`](../tasks/P01/P01-T006.md) — Clarify source-agnostic platform boundary. Completed.
- [`P01-T007`](../tasks/P01/P01-T007.md) — Harden JSON Pointer array writes. Completed (independent review APPROVE, merged to `main` at `f1cc577`).
- [`P01-T008`](../tasks/P01/P01-T008.md) — Establish project task governance and rename strategy. Completed (merged to `main` at `a267950`).
- [`P01-T009`](../tasks/P01/P01-T009.md) — Record Session Referee and verified-environment product vision (ADR 0014). Completed (merged to `main` at `a267950`).

**Exit criteria (phase gate — all met):**
- All of `P01-T001`–`P01-T006` complete. ✅
- `P01-T007` complete: the sparse-array target-write amplification finding from `P01-T004`'s security review is closed, with regression coverage, on `main`. ✅ Independently reviewed (APPROVE), merge-approved, and merged at `f1cc577`.
- `npm test` green after `P01-T007` lands on `main`. ✅ 47/47 passing, independently verified post-merge.

**Dependencies:** `P00`.

**Out of scope (explicitly deferred within this phase, per ADR 0012 and `docs/knowledge/shareable-templates.md`):** Workbench GUI, extension runtime loader/installer, `domains/pokemon/` code migration, live emulator export, mapping-project persistence, template-level embedding of mappings/calculated-fields/fixtures.

---

## P02 — Domain Boundary

**Status:** completed. Closed at `main@3170a9f` (fast-forward merge of `feat/P02-T006-pokemon-presentation-boundary`, independent review verdict APPROVE, project-owner merge approval granted, post-merge validation passed).

**Objective:** Extract Pokemon-specific state, mechanics, and presentation assumptions behind a real Pokemon domain boundary, per ADR 0008 and `docs/knowledge/domain-extensibility.md`, while keeping shared platform code domain-neutral.

**Entry conditions:** `P01` complete. ✅ Met.

**Major tasks:**
- [`P02-T001`](../tasks/P02/P02-T001.md) — Introduce the first Pokemon domain boundary around existing calculators. Completed (merged to `main` at `2617f4a`).
- [`P02-T002`](../tasks/P02/P02-T002.md) — Pokemon state/schema boundary (Pokemon-owned canonical schema plus compatibility alias). Completed (merged to `main` at `d2c24f1`).
- [`P02-T003`](../tasks/P02/P02-T003.md) — Domain registry descriptor immutability hardening (closes `P02-T001`'s non-blocking review finding). Completed (independent re-review APPROVE, merged to `main` at `7fa074b`).
- [`P02-T004`](../tasks/P02/P02-T004.md) — Record progress, spatial, cross-domain, and workflow-interoperability product direction. Documentation-only and non-gating; no `P02` runtime behavior or exit criterion changes.
- [`P02-T005`](../tasks/P02/P02-T005.md) — Public/private repository boundary governance. Completed; cross-cutting documentation work, not a `P02` exit criterion.
- [`P02-T006`](../tasks/P02/P02-T006.md) — Pokemon presentation/UI ownership and domain-extensible slot compatibility. Completed (independent review APPROVE, merged to `main` at `3170a9f`).

`P02-T002` and `P02-T003` were intentionally parallelizable — they touched disjoint files (schema/fixture paths vs. `src/platform/domain-registry.js` only) and landed independently. `P02-T006` was the separately scoped presentation/UI migration and closed the phase.

**Exit criteria (all met):** Pokemon-specific schema/engine/rendering code lives under a domain boundary; shared platform code (`src/schemas/{extension,template,mapping}.schema.json`, `src/expressions/`, `src/mapping/`, `src/overlay/`) contains no Pokemon-specific assumptions; existing MVP behavior is preserved and covered by tests. Calculator boundary: ✅ (`P02-T001`). Schema boundary: ✅ (`P02-T002`). Registry hardening: ✅ (`P02-T003`). Presentation ownership and slot leakage: ✅ (`P02-T006`), independently re-verified post-merge (79/79 tests, zero Pokemon references outside the domain package and compatibility shims).

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

**Status:** active. `P05-T001` through `P05-T006` and `P05-T009` are complete. The launcher now automates supported savestate loading while Lua script loading remains manual. `P05-T010` adds an expandable battle stat comparison panel on top of `P05-T009`'s data, pending independent review on `feat/P05-T010-battle-stat-comparison`. `P05-T011` (location encounter rates, bag Poke Ball inventory, dynamic catch-rate display) is scoped but not yet started. The phase gate still requires real mGBA (and, per `P06`, BizHawk) end-to-end acceptance evidence against this richer pipeline. `P05` remains active and is not complete until the real live acceptance test is performed and recorded.

**Objective:** Implement the first live source integration — the Gen 3 mGBA adapter sketched in `adapters/gen3-mgba/README.md` and `docs/project/roadmap.md`'s "First Real Live Integration" — against the source-agnostic platform boundary clarified in `P01-T006`.

**Entry conditions:** `P01` complete (source contract + mapping pipeline must exist to map live source data into normalized state). Does not strictly require `P02`/`P03`/`P04`, but should route through the mapping pipeline (`P01-T004`) rather than hand-writing normalized state, per `docs/knowledge/adapter-contracts.md`.

**Major tasks:**
- [`P05-T001`](../tasks/P05/P05-T001.md) — Overlay live-state consumption: turn the one-shot overlay load into a polling refresh loop tolerant of a missing/invalid/partially-written state file. Completed after independent review and merge; independent of mGBA acquisition.
- [`P05-T002`](../tasks/P05/P05-T002.md) — English retail Emerald Rev 0 acquisition proof through mGBA Lua, with strict fingerprint detection and developer diagnostic output. Completed (independent review APPROVE, merged to `main` at `3bdfd49`); intentionally stops before a source contract or normalized export.
- [`P05-T003`](../tasks/P05/P05-T003.md) - Named/versioned Emerald acquisition source contract, schema validation, public-safe fixture, and replace-via-temporary-file snapshot handoff. Completed (independent review APPROVE, merged to `main` at `235f91c`).
- [`P05-T004`](../tasks/P05/P05-T004.md) - Existing-runtime mapping into canonical Pokemon state, explicit placeholders, Ajv target validation, and atomic `public/live-state.json` handoff. Completed (independent review APPROVE, merged to `main` at `f301d6b`); real mGBA end-to-end acceptance remains a separate, still-pending manual step.
- [`P05-T005`](../tasks/P05/P05-T005.md) - Gitignored local Proof 1 configuration, path/setup validation, and Windows-friendly mGBA launch/manual handoff. Completed (independent review APPROVE, merged to `main` at `428324c`); no source, mapping, or emulator contract changes; real mGBA end-to-end acceptance remains a separate, still-pending manual step.
- [`P05-T006`](../tasks/P05/P05-T006.md) - Automates savestate loading via mGBA's documented `--savestate` CLI flag, after confirming (via mgba-emu/mgba#3289) that script loading has no supported non-GUI path. Completed (independent review APPROVE, fast-forward merged at `aa5d97b`).
- [`P05-T009`](../tasks/P05/P05-T009.md) - Full six-slot party/battle live dashboard: decodes all four Gen III encrypted substructs for every party slot (not one fixed slot), resolves species/move/item/location names and badges through a new game-owned reference-data layer, and redesigns the overlay presentation around it. Completed (independent review APPROVE, merged); the Lua port was exercised live against BizHawk with the real ROM as a connector smoke during review, though the full rich-dashboard acceptance session remains a separate follow-up.
- [`P05-T010`](../tasks/P05/P05-T010.md) - Expandable, collapsed-by-default battle stat comparison panel (Attack/Defense/Sp. Atk/Sp. Def/Speed/HP/Level, relative indicators), built entirely from `P05-T009`'s already-decoded fields with no new acquisition/schema work. Investigated battle stat-stage and active-battler-slot decoding and deferred both - no verifiable fixed memory address for the relevant runtime battle-engine structures exists in this offline environment. Implemented and pushed to `feat/P05-T010-battle-stat-comparison`; independent review pending.
- `P05-T011` - Location encounter rates and bag Poke Ball inventory with a dynamic, state-aware catch-rate display (accounting for current HP and status). Scoped but not yet started; split out from `P05-T010` due to substantially larger and different decoding scope (bag/inventory memory layout, wild encounter table data, Gen III catch-rate formula).

Remaining roadmap deliverables will be scoped separately: real mGBA/BizHawk end-to-end acceptance against the richer pipeline.

**Exit criteria:** Live party/opponent/seed/frame/bag/map data flows from mGBA through a source contract and mapping project into normalized state, rendered by the existing overlay. `P05-T001` supplies overlay refresh, `P05-T002` supplies acquisition, `P05-T003` supplies the source contract, `P05-T004` supplies initial mapping/normalized delivery, `P05-T009` supplies full-party/battle/lookup-data mapping and presentation, and `P05-T010` supplies the stat comparison panel. Real end-to-end acceptance remains outstanding; seed/frame, stat stages/active-battler tracking, and full bag acquisition remain out of scope so far and are not yet available.

**Dependencies:** `P01`.

**Out of scope:** A second emulator/source (that's part of `P06`'s proof, if a second source is chosen over a second domain).

---

## P06 — Second Source / Domain Proof

**Status:** active. BizHawk bootstrap is complete and provider-neutral Emerald acquisition reuse is implemented for review. `P05` remains active and its real acceptance gate is not waived.

**Objective:** Prove the architecture is not accidentally Pokemon-specific or emulator-specific by exercising it against a second source and/or domain. The exact choice does not need to be made now.

**Entry conditions:** `P02` complete. The original full-proof gate also requires `P05` complete. By explicit project-owner direction, BizHawk launcher/acquisition work proceeds in parallel while `P05` acceptance remains open; no P06 exit criterion can be claimed until the original gate and real second-source proof are met.

**Major tasks:**
- [`P06-T001`](../tasks/P06/P06-T001.md) - BizHawk 2.11.1 local launcher and auto-loaded identity/frame connector. Completed.
- [`P06-T002`](../tasks/P06/P06-T002.md) - Provider-neutral Emerald Rev 0 acquisition ownership and BizHawk emission through the existing mapping/domain/overlay path. Implemented; awaiting independent review and real-ROM operator acceptance.

**Exit criteria:** A second source or domain works through the existing platform contracts (extension, mapping, and — if `P02`/`P05` order allows — domain boundary) without platform-layer changes beyond what the contracts already allow.

**Dependencies:** `P02`, `P05`.

**Out of scope:** A second game domain, semantic events/actions, and treating repository-only tests as real-ROM Proof 2 acceptance.

---

## Later Product Tracks (not yet phased)

Kept coarse until the earlier contracts above are proven, per `docs/project/roadmap.md`'s "Subsequent Product Tracks": Extension Workbench GUI, richer Pokemon assistant functionality (battle projections, route/capture support, scoring, facility set identification, move prediction), ruleset-defined progress and common session results, progression graphs and spatial/map views, local automation and action providers, optional external workflow interoperability, local same-domain or cross-domain sessions/rules, a Session Referee capable of declaring/negotiating/verifying/enforcing session environments (game/version/hash/seed/ruleset/modification-set), a reviewed game-modification registry with explicit user-authorized activation, optional hosted services ("EOE Cloud" in current product-vision naming — see `docs/project/branding-and-renaming.md`), matchmaking and community features, and marketplace/commercial services. Full detail lives in `docs/knowledge/product-vision.md`; ADR 0014 records Session Referee direction and ADR 0016 records progress/spatial/cross-domain/workflow boundaries. These tracks depend on contracts not yet proven, so they are not pulled into the near-term `P02`–`P06` sequence. They will be broken into phases (`P07`+) only when the earlier contracts justify it.

## Updating this plan

- When a task completes, update its status in the relevant `docs/tasks/<PhaseID>/<TaskID>.md` file — do not duplicate that detail here.
- When all of a phase's exit criteria are met, update that phase's **Status** here and in the table at the top, and update `docs/project/roadmap.md` if the product-level framing also changes.
- When a new phase starts, break it into task records under `docs/tasks/<PhaseID>/` as work is scoped — this document does not need every task pre-created before a phase begins.
