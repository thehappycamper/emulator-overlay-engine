# ADR 0005: Flexible Data And UI Extension Model

Date: 2026-08-08

Status: accepted

## Context

The engine needs to support vanilla games, ROM hacks, fan games, custom tables, fusion mechanics, custom scoring systems, and specialized overlay panels. Hardcoding each case into core would make the project difficult to scale and maintain.

## Decision

Use extensions for both data and UI.

Data, game, mechanics, and analysis extensions provide facts, mappings, formulas, or computed outputs. Overlay panel extensions provide optional UI surfaces that consume normalized state and extension outputs.

Core should provide stable contracts:

- Normalized overlay state schema.
- Extension manifest schema.
- Engine calculations.
- Overlay host and panel slots.

The normalized state includes a top-level `extensions` object for namespaced extension runtime data.

## Consequences

- New game/hack/fusion support can be added without modifying core for every custom table.
- UI can grow through panels instead of one large hardcoded dashboard.
- Extension loading and trust model still need future implementation.
- Extension IDs must be stable and collision-resistant.

