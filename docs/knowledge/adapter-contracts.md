# Adapter Contracts

Source providers and adapters acquire source-specific gameplay information and expose it through source contracts. EOE Core should not depend on the acquisition method.

The intended boundary is:

```text
Source Provider / Adapter -> Source Contract -> Mapping Runtime -> Named Target
```

The source-provider runtime contract is not implemented yet. The current mapping format already identifies named/versioned source contracts without assuming emulator memory.

## Common Source Provider Contract

Responsibilities:

- Acquire gameplay information from one supported source.
- Decode enough source-specific structure to emit a documented source contract.
- Identify source/provider and supported game/version assumptions.
- Keep source-specific APIs, addresses, protocols, parsing, or inference inside the provider boundary.
- Document whether values are exact, derived, detected, or otherwise limited when known.

Non-responsibilities:

- Domain calculations unrelated to acquisition.
- Rules, actions, sessions, or UI layout.
- Requiring downstream consumers to understand the acquisition method.

Potential providers may use emulator APIs/scripts, native game plugins, browser integrations, network telemetry, logs, saves, publisher APIs, existing gaming protocols, vision/audio recognition, or hardware sensors. This taxonomy is illustrative; none of these integrations is promised by this document.

## Emulator Adapter Contract

An emulator adapter is one source-provider type, not the platform-wide input assumption.

Responsibilities:

- Connect to or run inside the emulator.
- Read live memory/state.
- Emit documented source snapshots periodically.
- Document setup and emulator version assumptions.

Non-responsibilities:

- Damage calculations.
- Capture calculations.
- Challenge scoring.
- UI layout.

## Game Adapter Contract

A game adapter may compose with an emulator or another provider to decode game/version-specific source structures.

Responsibilities:

- Map source-specific addresses, fields, or identifiers.
- Decode encrypted or packed game structures when applicable.
- Resolve generation-specific IDs.
- Identify game code, revision, or ROM hack target.
- Emit a documented game-specific source contract for mapping, or a reviewed normalized target during an early direct-export integration.

Non-responsibilities:

- Generic battle math unless the generation changes the formula.
- Visual presentation.

## Data Adapter Contract

Responsibilities:

- Provide species, moves, items, abilities, encounters, learnsets, TMs, trainers, and Battle Factory sets.
- Document source and version of data.
- Handle ROM hack changes through mapping files or extracted datasets.

Non-responsibilities:

- Emulator memory reads.
- UI layout.

## Source And Export Shape

Source providers should normally emit a documented named/versioned source contract for declarative mapping into a named target.

An adapter MAY produce an already-normalized named target directly when the adapter can do so deterministically and the bypass is documented and validated against that target contract. This is a pragmatic alternative when a separate mapping adds no value; it does not permit source-specific details to leak into downstream consumers. Consumers depend on the named target contract either way.

The current Pokemon-oriented live-export target is:

```text
src/domains/pokemon/schemas/overlay-state.schema.json
```

`src/schemas/overlay-state.schema.json` remains a compatibility reference for older integrations; it delegates to the Pokemon-owned contract and is not a platform-owned payload definition.

The first live implementation may write `public/live-state.json` for polling. A later transport may differ, but payload semantics should remain tied to the selected named target contract rather than acquisition mechanics.

`P05-T002` precedes that integration with an acquisition-only proof under `adapters/gen3-mgba/`: a strict-fingerprint Emerald Rev 0 Lua diagnostic reads changing emulator values but intentionally defines no source contract, normalized export, transport, or overlay polling behavior. Those remain separately reviewed tasks.

## Fidelity, Provenance, And Confidence

Providers may eventually differ in fidelity. Emulator memory may expose exact values, while vision or audio providers may infer values with uncertainty. Future source, state, or event contracts may need provenance/confidence metadata, but this document does not define those fields. That work requires a separate architecture and schema decision.

## Extension Manifest

New adapters should include an `extension.json` manifest. Example manifests live in:

```text
examples/extensions/
```
