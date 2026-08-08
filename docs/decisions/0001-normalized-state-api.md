# ADR 0001: Use A Normalized State API

Date: 2026-08-08

Status: accepted

## Context

The project needs to support multiple Pokemon generations, multiple emulators, and ROM hacks. Emulator memory layouts and ROM data can differ, but the overlay and core engines should remain reusable.

## Decision

Use a normalized JSON state API as the boundary between adapters and the engine/overlay.

The public schema lives at:

```text
src/schemas/overlay-state.schema.json
```

Adapters map emulator, generation, ROM, and ROM-hack specifics into that schema. Engine and overlay code consume normalized state.

## Consequences

- Core logic can be tested without an emulator.
- ROM hacks can be supported through mappings and data adapters.
- Live export can start with file polling and later move to WebSockets without changing core payload semantics.
- Schema changes must be deliberate and documented.

