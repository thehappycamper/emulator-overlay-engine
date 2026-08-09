# Pokemon Emerald mGBA Acquisition Proof

This adapter contains the first read-only live acquisition proof for Pokemon Emerald. It displays a changing, developer-oriented JSON diagnostic inside mGBA; it does not emit the final source contract or normalized Pokemon state.

## Supported Baseline

| Component | Supported value |
| --- | --- |
| Emulator | mGBA 0.10.3 desktop build with Lua scripting |
| Game | Pokemon Emerald, English retail Rev 0 |
| Game code | `AGB-BPEE` |
| Header revision | `0` |
| CRC32 | `1F1C08FB` |
| SHA-1 reference | `f3ae088181bf583e55daf962a92bb46f4f1d07b7` |

The script checks game code, internal title, header revision, and CRC32 before reading version-specific addresses. A mismatch produces an `unsupported-rom` diagnostic and no gameplay-memory reads. ROM hacks, randomizers, translations, and other Emerald revisions are unsupported even when they retain some compatible addresses.

The SHA-1 is the English retail ROM fingerprint documented by [pret/pokeemerald](https://github.com/pret/pokeemerald). It is documentation-only because mGBA 0.10's Lua API exposes CRC32, not SHA-1.

## Acquisition Mechanism

mGBA 0.10 introduced built-in Lua scripting. The provider uses the documented `emu:read8`, `emu:read16`, `emu:read32`, ROM-memory domain, checksum, text-buffer, and frame-callback APIs. See the [mGBA scripting API](https://mgba.io/docs/scripting.html).

`emerald-acquisition.lua` owns emulator API calls and retail addresses. `emerald-us-rev0.js` is the deterministic reference for identity checks, Gen III encrypted-species decoding, struct offsets, pointer validation, and diagnostic assembly used by Node tests.

The script is read-only. It does not write emulator memory, create save data, or write files.

## Live Fields

The diagnostic currently reads:

- game code, title, software revision, and CRC32;
- party count;
- first party Pokemon species ID, level, current HP, and max HP;
- battle-active state from `gMain.inBattle`;
- raw battle type flags and first enemy-party species/level/HP while battle is active;
- current map group, map number, and local coordinates through the validated `gSaveBlock1Ptr`.

Species values are Gen III internal species IDs. Name-table lookup is intentionally deferred.

## Run The Proof

1. Start mGBA 0.10.3 and load a legally obtained English retail Pokemon Emerald Rev 0 ROM matching the fingerprint above.
2. In mGBA, choose **Tools > Scripting...**.
3. Choose **Load script** and select `adapters/gen3-mgba/emerald-acquisition.lua` from this repository.
4. Open the `Emerald acquisition` text buffer in the scripting window.
5. Confirm the JSON has `"status":"ok"` and inspect `party.first.currentHp`.
6. Take damage or heal the first party Pokemon in game without restarting mGBA.
7. Confirm `party.first.currentHp` changes in the diagnostic.
8. Enter or leave a battle and confirm `battle.active` changes. Move to another map and confirm at least one of `location.mapGroup` or `location.mapNumber` changes.

An unsupported fingerprint should instead display `"status":"unsupported-rom"` with actual and expected identifiers.

## Diagnostic Shape

Example only; this is not a public source or normalized-state contract:

```json
{
  "diagnosticVersion": "0.1.0",
  "status": "ok",
  "game": { "gameCode": "AGB-BPEE", "title": "POKEMON EMER", "revision": 0, "crc32": "1F1C08FB" },
  "party": { "count": 1, "first": { "speciesId": 258, "level": 15, "currentHp": 31, "maxHp": 35 } },
  "battle": { "active": false, "typeFlags": 0, "opponent": null },
  "location": { "mapGroup": 0, "mapNumber": 16, "x": 23, "y": 14 }
}
```

## Address And Structure Sources

The supported ROM fingerprint and game semantics are tied to the English retail layout reconstructed by [pret/pokeemerald](https://github.com/pret/pokeemerald):

- [`include/pokemon.h`](https://github.com/pret/pokeemerald/blob/master/include/pokemon.h) defines the 100-byte party `Pokemon` structure and live level/HP fields.
- [`src/pokemon.c`](https://github.com/pret/pokeemerald/blob/master/src/pokemon.c) defines party/enemy storage and the 24 encrypted substructure permutations.
- [`include/main.h`](https://github.com/pret/pokeemerald/blob/master/include/main.h) defines the `gMain.inBattle` flag.
- [`include/global.h`](https://github.com/pret/pokeemerald/blob/master/include/global.h) defines `SaveBlock1`, current warp data, and coordinates.

The addresses are deliberately kept in this game/emulator adapter. They are not platform or Pokemon-domain assumptions.

## Tests And Fixtures

`fixtures/emerald-us-rev0-derived.json` contains synthetic numeric values only. It contains no ROM, BIOS, save, savestate, or copied game bytes. `npm test` verifies fingerprint rejection, all growth-substructure positions, encrypted species decoding, HP/stat offsets, battle/location diagnostics, pointer rejection, and synchronization of Lua address constants with the tested JavaScript layout.

## Known Limitations

- Only the exact English retail Rev 0 fingerprint is accepted.
- mGBA 0.10.3 is the only emulator build verified for this task.
- Output is a text-buffer diagnostic, not a source contract, mapping input, normalized state, file transport, or live overlay feed.
- Only the first party and first enemy-party records are read.
- Species names, double-battle active slots, transient loading states, and broader corruption/plausibility checks are deferred.
- The Lua script and JavaScript reference implement the same small layout separately; tests pin shared constants, but CI cannot execute mGBA's embedded Lua runtime.

## Recommended Next Task

Define the named/versioned Emerald acquisition source contract and adapt this proven reader to emit validated source snapshots. Keep mapping into the Pokemon state contract and end-to-end live integration in later, separate tasks; domain-neutral overlay polling is already implemented independently on the `P05-T001` review branch.
