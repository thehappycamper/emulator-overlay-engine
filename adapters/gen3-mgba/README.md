# Gen 3 mGBA Adapter

This adapter will export live mGBA Lua memory reads into the normalized overlay API.

## First Targets

- Party count and party structs.
- Active opponent or wild Pokemon struct.
- Seed and frame.
- Bag balls and TMs.
- Current map bank/map number.

## Mapping Contract

The Lua side should write JSON shaped like `src/schemas/overlay-state.schema.json`.

Shared platform and domain modules should not know mGBA memory addresses. The adapter owns addresses, Gen 3 encrypted Pokemon struct decoding, game code detection, and ROM-specific data lookups.

## Notes

An existing Gen 3 mGBA Lua stats script can be used as a reference if available locally. The first adapter implementation should reuse equivalent logic for party Pokemon, enemy Pokemon, IVs, EVs, moves, PID, nature, seed, and frame, then export normalized state.
