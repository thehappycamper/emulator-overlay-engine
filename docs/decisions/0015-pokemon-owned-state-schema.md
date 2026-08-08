# ADR 0015: Pokemon Owns Its Normalized State Contract

Date: 2026-08-08

Status: accepted

Amends: ADR 0001

Implements: ADR 0008

## Context

The first MVP placed a Pokemon-shaped normalized-state schema at `src/schemas/overlay-state.schema.json`. That location made a domain payload appear to be a shared platform contract even though its fields describe Pokemon parties, battles, moves, encounters, and items.

P02-T001 established a domain-neutral registry and a real Pokemon package. The next boundary must give the Pokemon domain clear ownership of its state contract without breaking the existing overlay, fixtures, or early integration guidance.

Two approaches were considered:

1. Add a domain-neutral envelope containing contract metadata and a Pokemon payload.
2. Move the current schema unchanged into the Pokemon domain and retain a compatibility reference at the old path.

The current overlay consumes the Pokemon payload directly. The mapping runtime already treats named source and target descriptors as opaque contract metadata, so it does not require a universal state envelope. Adding an envelope now would break current consumers and create a generic abstraction without a second concrete need.

## Decision

Move the current state schema wholesale into the Pokemon domain.

The canonical schema is:

```text
src/domains/pokemon/schemas/overlay-state.schema.json
https://emulator-overlay-engine.local/schemas/overlay-state.schema.json
```

The domain descriptor exposes the same named contract through `pokemonDomain.stateContract` with ID `pokemon.overlay-state`, type `normalized-state`, version `0.1.0`, and the canonical schema URI.

Preserve the existing public schema ID on the moved canonical schema. Keep `src/schemas/overlay-state.schema.json` as a compatibility alias for the former physical path. The compatibility file has no independent `$id` and contains only a `$ref` to the Pokemon-owned schema; it does not duplicate Pokemon fields.

Do not add a platform state envelope in this slice. Existing state payloads remain structurally unchanged.

Source acquisition remains separate from state ownership:

```text
Source Provider -> Source Contract -> Mapping Runtime -> Pokemon-owned Normalized State
```

The Pokemon state contract describes domain meaning, not memory addresses, emulator APIs, or acquisition behavior.

Future Pokemon reuse should use composition rather than one domain per game or class-style inheritance:

```text
Pokemon Domain
  + Generation / Mechanics
  + Game Configuration
  + Revision / ROM Hack / Mod Overrides
```

This decision reserves that composition direction but does not define generation, game, revision, or override package contracts.

## Consequences

- Pokemon fields have one canonical schema owner under `src/domains/pokemon/`.
- Shared platform schemas do not define Pokemon payload fields.
- Existing direct state consumers and fixtures remain compatible because the payload shape is unchanged.
- Consumers using the existing schema ID continue to resolve the same contract without an identifier migration.
- Consumers loading the old physical path receive a compatibility reference to the canonical schema.
- New integrations should reference the canonical Pokemon schema and contract metadata.
- Future domains can own different normalized-state contracts without inheriting Pokemon fields.
- A universal state envelope may be reconsidered only when concrete cross-domain runtime requirements justify it.
- Semantic events, provenance/confidence metadata, source-provider contracts, generation/game composition, and remaining Pokemon UI migration remain separate future decisions.
