# Architecture Knowledge

Emulator Overlay Engine separates live data collection from domain logic and UI rendering.

## Layers

1. Emulator Adapter

Reads data from a concrete emulator such as mGBA or VBA-RR. This layer may use Lua, emulator APIs, file export, sockets, or other emulator-supported mechanisms.

2. Game Adapter

Maps generation and ROM-specific addresses, structs, tables, and IDs into normalized concepts. This includes ROM hacks.

3. Data Adapter

Provides static or extracted data: species, moves, items, abilities, type chart, learnsets, TM compatibility, encounters, trainers, Battle Factory sets, and mechanics differences.

4. Mapping Runtime

Transforms source JSON into a named and versioned target contract through direct fields, ID/value mappings, and safe calculated expressions. The runtime does not execute mapping-provided code.

5. Domain Engine

Calculates domain-specific outputs. For Pokemon, this includes damage, capture odds, legality, route summaries, score changes, set matching, and move predictions from normalized state and data.

6. Overlay

Renders the current state and engine outputs. It should not know emulator memory addresses or ROM-specific formats.

## Design Constraints

- Normalized state APIs are integration boundaries.
- Mapping source and target descriptors identify contracts without assuming a domain or payload category.
- Mapping calculations use the whitelisted JSON expression AST, never arbitrary JavaScript.
- Domain engine functions should be deterministic and testable.
- ROM hacks should be handled by adapter/data mappings, not generic engine forks.
- Overlay rendering should degrade gracefully when optional data is unavailable.
- Any long-term API change should have an ADR.
