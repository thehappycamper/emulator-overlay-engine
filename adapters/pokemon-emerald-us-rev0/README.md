# Pokemon Emerald Rev 0 Acquisition

This game-owned adapter is the canonical home of the English retail Pokemon Emerald Rev 0 acquisition contract:

```text
pokemon.emerald.us-rev0.acquisition@1.0.0
```

It owns the exact game fingerprint, Emerald addresses, shared Gen III party decoding, source schema, public-safe fixtures, and the existing declarative mapping into `pokemon.overlay-state@0.1.0`. It does not own emulator lifecycle or emulator APIs.

Provider composition is:

```text
mGBA Lua -----\
               > shared Emerald acquisition -> validated source snapshot
BizHawk Lua --/
                                      -> existing mapping
                                      -> validated Pokemon state
                                      -> public/live-state.json
                                      -> existing overlay
```

Provider provenance is retained under `source`. The semantic game fields remain identical between providers. `memory.addressSpace` is `gba-system-bus`; provider-specific domain/API names are diagnostic metadata, not downstream branching keys.

Only Emerald English retail Rev 0 is supported: game code `AGB-BPEE`, revision `0`, CRC32 `1F1C08FB`, SHA-1 `F3AE088181BF583E55DAF962A92BB46F4F1D07B7`. Providers must fail closed before publishing when they cannot establish that identity or when acquisition invariants fail.

The current contract remains intentionally narrow: one fixed party entry, one fixed opponent entry, battle flags, and raw location identifiers. Whole-party iteration, lookup data, moves, bag contents, seed/frame, and semantic events remain future work.

No ROM, BIOS, save, savestate, emulator binary, or copied game data belongs here. Fixtures contain only synthetic derived values.
