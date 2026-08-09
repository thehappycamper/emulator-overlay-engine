# ADR 0019: Emerald Mapping And Live-State Handoff

Date: 2026-08-08

Status: accepted; provider ownership and mapping location superseded by ADR 0020

Implements: ADR 0012, ADR 0015, ADR 0018

## Context

The Emerald mGBA provider now emits `pokemon.emerald.us-rev0.mgba.acquisition@1.0.0`, but the browser overlay consumes the Pokemon-owned `pokemon.overlay-state@0.1.0` contract. The source currently supplies only one fixed party record, one fixed opponent record, raw battle flags, and raw location identifiers. The normalized state schema requires additional Pokemon presentation fields that acquisition cannot yet provide.

The first live integration must use the existing safe mapping runtime, validate the domain-owned target, and avoid publishing partially written or schema-invalid overlay state.

## Decision

Add the adapter-owned declarative mapping project:

```text
adapters/gen3-mgba/mappings/emerald-us-rev0-to-pokemon-overlay-state.mapping.json
```

The project maps acquired game identity, party/opponent species ID, level, HP, and raw source metadata directly. Acquisition-only flags and coordinates are preserved under the source contract's key in normalized `extensions`; they are not promoted to invented domain semantics.

Use explicit literal placeholders for normalized fields that the source does not provide:

- `Species name unavailable` for party/opponent names;
- `unknown` types;
- zero-valued stats;
- empty moves, bag, TM, and encounter arrays;
- `Location name unavailable` until map lookup data exists.

The placeholders are compatibility scaffolding for the current required Pokemon state and renderer. They are not inferred gameplay values. The mapping remains fixed-slot: party index `0` only when party count is nonzero, and one opponent only while battle is active.

`adapters/gen3-mgba/emerald-state-mapping.js` must call `applyMappingProject()` with a target-validation callback compiled by Ajv from the canonical Pokemon schema. Source, mapping, and target descriptors are checked before output. Invalid source, mapping, or target data fails before publication and leaves the last complete live-state file unchanged.

Publish normalized output through a temporary sibling file followed by rename to `public/live-state.json`. The local `tools/emerald-live-state.mjs` runner polls the acquisition snapshot without overlapping work and applies the checked-in mapping whenever source JSON changes.

## Consequences

- The first local source-to-normalized-state pipeline is executable without putting mapping logic in Lua.
- The Pokemon schema remains unchanged and authoritative.
- The runtime file `public/live-state.json` is generated locally and remains ignored by Git.
- Placeholder limitations are visible and reviewable in JSON rather than hidden in imperative code.
- Species/move/map lookup data can replace placeholders in later mapping/data tasks without redesigning acquisition.
- The polling runner is a narrow local integration tool, not a generic transport daemon, WebSocket service, or event system.
- Whole-party iteration, richer battle slots, bag/moves, seed/frame, and lookup tables remain future P05 work.
