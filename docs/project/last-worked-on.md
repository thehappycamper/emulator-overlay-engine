# Last Worked On

## 2026-08-08 - Event-Driven Platform Vision

Goal:

- Record EOE's evolution from an overlay-centered product into an extensible game telemetry and interaction platform.
- Establish semantic events as a future platform primitive without implementing event, action, session, or hosted behavior.

Changes:

- Added `docs/knowledge/product-vision.md` as the canonical product definition and long-term pipeline.
- Recorded state, semantic events, actions, automation providers, Workbench expansion, sessions, optional EOE Cloud, and ecosystem reuse direction.
- Added ADR 0013 establishing normalized semantic events as a future first-class primitive above normalized state and domain interpretation.
- Updated active architecture, domain, UI, template, agent, feature, roadmap, graph, and README guidance.
- Re-sequenced the roadmap around domain/state/event/action foundations before the first live integration.
- Kept every future capability explicitly marked as planned and preserved the current safe mapping/state implementation unchanged.

Why:

- Overlay rendering is the first product surface but does not define the platform's full architectural boundary.
- Semantic domain events can let overlays, automations, rules, sessions, and hosted services share meaning without depending on emulator memory details.
- Product memory must distinguish current foundations from future direction so agents do not implement speculative systems prematurely.

Next Actions:

- Prove a Pokemon domain package boundary in a separately approved slice.
- Stabilize the source/state pipeline before defining event contracts.
- Design the normalized event schema and detection proof in a separate ADR and implementation slice.
- Design action, session, and hosted boundaries only after the event foundation is proven.
- Rename the local folder to `emulator-overlay-engine` when convenient. The GitHub repository and remote URL now use `emulator-overlay-engine`.
