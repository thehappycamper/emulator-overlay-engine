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

The current contract remains intentionally narrow: full occupied party decoding, one fixed opponent entry, battle flags, raw location identifiers, and the Poke Ball pocket. Bag quantities are decrypted from their raw `u16` values with `SaveBlock2.encryptionKey`; if SaveBlock1 or SaveBlock2/key data is unreadable, `bag` is null rather than guessed. Other pockets, seed/frame, and semantic events remain future work.

Live battle stat stages (Attack/Defense/Speed/Sp. Atk/Sp. Def/Accuracy/Evasion modifiers, `-6..+6`) for the player's and opponent's single active battlers are read from `gBattleMons` at a fixed EWRAM address established from a community-maintained, independently cross-checked linker/RAM map (see `emerald-us-rev0.js`'s `battle` constant block for the full citation); `battle.player.statStages` and `battle.opponent.statStages` are null outside of an active battle or when the read is out of the game's real `[0,12]` raw range. This does not resolve which party slot the active battler corresponds to - that remains the same open problem `activePlayerIndex` already discloses.

After the existing declarative mapping, the Pokemon domain derives `stageAdjustedStats` for the five ordinary battle stats using `pret/pokeemerald`'s `gStatStageRatios` and integer multiply-then-divide semantics. These values apply only stat-stage modifiers and are not the complete effective stat; raw `stats` and `statStages` remain available. If either raw stats or a stage is unavailable/invalid, the derived view is null rather than assuming neutral.

No ROM, BIOS, save, savestate, emulator binary, or copied game data belongs here. Fixtures contain only synthetic derived values.
