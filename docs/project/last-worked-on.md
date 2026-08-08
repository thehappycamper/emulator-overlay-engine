# Last Worked On

## 2026-08-08 - Source-Agnostic Platform Clarification

Goal:

- Clarify that EOE Core is source-agnostic and emulator memory is one gameplay source rather than a platform assumption.
- Preserve the source-provider boundary without implementing new adapters or metadata schemas.

Changes:

- Recorded `Source Provider -> Source Contract -> Mapping -> Normalized State` as the acquisition-independent boundary.
- Documented emulator, native, browser, telemetry, file/API/protocol, vision/audio, and hardware source classes as examples rather than implementation commitments.
- Updated adapter responsibilities so source acquisition and decoding remain outside downstream EOE Core.
- Recorded future fidelity, provenance, and confidence concerns without defining schema fields.
- Updated agent guidance and the architecture graph to prevent emulator-memory assumptions from entering shared code.
- Preserved all runtime, schema, mapping, event, and adapter behavior unchanged.

Why:

- Direct emulator integrations are important, but coupling downstream contracts to emulator memory would exclude native, browser, console-observation, protocol, and hardware sources.
- Source contracts let mapping, domains, events, and experiences remain independent of acquisition mechanics.
- Inferred sources may need quality metadata later, but premature fields would lock in semantics before a real proof.

Next Actions:

- Prove a Pokemon domain package boundary in a separately approved slice.
- Stabilize the source/state pipeline before defining event contracts.
- Define source-provider runtime and provenance/confidence contracts only in separately approved slices with concrete source proofs.
- Design the normalized event schema and detection proof in a separate ADR and implementation slice.
- Design action, session, and hosted boundaries only after the event foundation is proven.
- Rename the local folder to `emulator-overlay-engine` when convenient. The GitHub repository and remote URL now use `emulator-overlay-engine`.
