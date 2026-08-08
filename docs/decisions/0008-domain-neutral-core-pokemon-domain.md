# ADR 0008: Domain-Neutral Core With Pokemon As First Domain

Date: 2026-08-08

Status: accepted

Supersedes: ADR 0007

## Context

The extension and workbench model can support more than Pokemon. Users could map data, calculated fields, emulator state, and UI panels for many games.

Keeping Pokemon concepts in the shared core would make the platform less reusable.

## Decision

Design the long-term architecture as a domain-neutral game overlay platform.

Pokemon should be implemented as the first domain package/extension set, not as a permanent assumption in the shared platform layer.

Shared platform responsibilities:

- Extension manifests and registry.
- Transport.
- Workbench data import, mapping, calculated fields, validation, preview, and export.
- UI panel host and slot system.
- Documentation, CI, and contribution workflow.

Domain responsibilities:

- Domain schemas.
- Domain calculators.
- Domain data models.
- Domain-specific overlay panels.
- Domain-specific analysis modules.

## Consequences

- The current Pokemon-specific MVP becomes the first domain implementation.
- Future refactors should move Pokemon-specific schemas/calculators toward a `domains/pokemon/` boundary.
- Non-Pokemon games can be supported without weakening Pokemon accuracy.
- Extension authors can target either the platform or a specific domain.

