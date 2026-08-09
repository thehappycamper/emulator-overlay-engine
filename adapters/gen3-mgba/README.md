# Pokemon Emerald mGBA Source Provider

This adapter reads a small, changing set of Pokemon Emerald values through mGBA and publishes the named source contract `pokemon.emerald.us-rev0.mgba.acquisition@1.0.0`. A checked-in declarative mapping and local runner transform that source into validated `pokemon.overlay-state@0.1.0` at `public/live-state.json`.

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

`emerald-acquisition.lua` owns emulator API calls, retail addresses, contract serialization, and the local snapshot handoff. `emerald-us-rev0.js` is the deterministic reference for identity checks, Gen III encrypted-species decoding, struct offsets, and pointer validation. `emerald-source-contract.js` wraps those acquired values with contract/game identity; `validate-source-snapshot.js` validates snapshots against the adapter-owned JSON Schema.

The script is read-only with respect to emulator/game memory. It writes derived JSON telemetry only to the configured local snapshot path.

## Source Contract

| Property | Value |
| --- | --- |
| Contract ID | `pokemon.emerald.us-rev0.mgba.acquisition` |
| Contract version | `1.0.0` |
| Canonical schema | `schemas/emerald-us-rev0-source.schema.json` |
| Public-safe fixture | `fixtures/emerald-us-rev0.source.json` |

The schema is adapter-owned because these are raw acquisition fields for one game/revision/provider, not platform or normalized Pokemon fields. Success snapshots contain no diagnostic status. `waiting-for-game`, `unsupported-rom`, and `invalid-memory` remain text-buffer diagnostics and cause the canonical snapshot to be absent.

## Normalized-State Mapping

`mappings/emerald-us-rev0-to-pokemon-overlay-state.mapping.json` is the canonical source-to-target mapping. `emerald-state-mapping.js` validates the source and mapping, calls the shared `applyMappingProject()` runtime, then validates the result against `src/domains/pokemon/schemas/overlay-state.schema.json` with Ajv.

The current source has one fixed party record and one fixed opponent record. The mapping therefore emits at most party index `0` and one opponent. It uses explicit compatibility placeholders for required fields acquisition does not provide:

- name: `Species name unavailable`;
- types: `unknown`;
- stats: zero values;
- moves, bag balls, TMs, and encounters: empty arrays;
- location name: `Location name unavailable`.

These are not inferred gameplay values. Raw revision, CRC, party count, battle flags, and map identifiers/coordinates are retained under `extensions["pokemon.emerald.us-rev0.mgba.acquisition"]`.

## Live Fields

The source snapshot currently reads:

- game code, title, software revision, and CRC32;
- party count;
- first party Pokemon species ID, level, current HP, and max HP;
- battle-active state from `gMain.inBattle`;
- raw battle type flags and first enemy-party species/level/HP while battle is active;
- current map group, map number, and local coordinates through the validated `gSaveBlock1Ptr`.

Species values are Gen III internal species IDs. Name-table lookup is intentionally deferred.

## Proof 1 Launcher

The repository includes a Windows-friendly setup launcher so machine paths do not need to be re-entered across terminals or committed to Git:

```powershell
Copy-Item .env.local.example .env.local
# Edit .env.local with local mGBA and legally obtained ROM paths.
npm run proof:emerald -- --check
npm run proof:emerald
```

The launcher validates the mGBA executable, ROM, optional savestate, output paths, poll interval, and port. It creates the source/live-state parent directories and launches mGBA with the ROM while exporting `EMERALD_SOURCE_SNAPSHOT_PATH` to the child process. It then prints the exact Lua, mapper, server, and browser steps for the configured paths.

When a savestate is configured, the launcher passes it via `mgba-qt`'s documented `-t`/`--savestate` command-line flag, so mGBA starts already at that position — no manual **File > Load State** step. This flag is officially documented for `mgba-qt` (see the [command-line reference](https://manpages.ubuntu.com/manpages/focal/man6/mgba-qt.6.html)); it is not GUI automation, it is a supported startup argument.

**Tools > Scripting... > Load script** remains the one manual step: mGBA has no supported command-line or config-file way to auto-load a script. This was explicitly requested upstream and closed as "not planned" by the mGBA maintainers ([mgba-emu/mgba#3289](https://github.com/mgba-emu/mgba/issues/3289)), so a reliable non-GUI path does not currently exist. After the first session, **Tools > Scripting... > Load recent script** is a faster one-click reload of the same script than browsing to it again. Close any existing mGBA instance before launching so the process that loads the script inherits the environment. `.env.local` is ignored; `.env.local.example` contains fake paths only.

## Configure The Snapshot

Set `EMERALD_SOURCE_SNAPSHOT_PATH` in the process environment **before starting mGBA**. mGBA does not load this repository's `.env` file itself. Use an absolute path and create its parent directory first. For example, from the repository root in PowerShell:

```powershell
New-Item -ItemType Directory -Force var/snapshots
$env:EMERALD_SOURCE_SNAPSHOT_PATH = (Resolve-Path var/snapshots).Path + "\emerald-us-rev0.source.json"
& $env:EOE_MGBA_EXE
```

The path is local-only and ignored under `var/snapshots/`. The provider writes a sibling `.tmp` file, flushes and closes it, then renames it to the configured path. On Windows, replacement may briefly make the canonical path absent; it never exposes partially written JSON. The provider rewrites only when acquired values change. It removes the canonical snapshot when the game is absent, unsupported, or fails the implemented plausibility check.

Do not configure the overlay to read this source file. Run `npm run live:emerald` to map it into validated `public/live-state.json`; the mapper writes a sibling temporary file and renames only after target validation and a complete write.

## Run The Provider

1. Start mGBA 0.10.3 and load a legally obtained English retail Pokemon Emerald Rev 0 ROM matching the fingerprint above.
2. In mGBA, choose **Tools > Scripting...**.
3. Choose **Load script** and select `adapters/gen3-mgba/emerald-acquisition.lua` from this repository.
4. Open the `Emerald acquisition source` text buffer in the scripting window.
5. Confirm the JSON has `"contract":{"id":"pokemon.emerald.us-rev0.mgba.acquisition","version":"1.0.0"}` and inspect `party.first.currentHp`.
6. Take damage or heal the first party Pokemon in game without restarting mGBA.
7. Confirm `party.first.currentHp` changes in the diagnostic.
8. Parse the file at `EMERALD_SOURCE_SNAPSHOT_PATH` and confirm its HP changed without restarting mGBA. Enter or leave a battle and confirm `battle.active` changes; move to another map and confirm at least one location identifier changes.

An unsupported fingerprint should instead display `"status":"unsupported-rom"` with actual and expected identifiers.

## First End-To-End Live Test

The preferred workflow is `npm run proof:emerald`; the launcher prints commands containing the configured paths. Run all commands from the repository root. The mGBA process must inherit `EMERALD_SOURCE_SNAPSHOT_PATH`; setting it after mGBA starts has no effect.

1. Install dependencies, create the local config, fill in its fake paths, and validate it:

   ```powershell
   npm ci
   Copy-Item .env.local.example .env.local
   npm run proof:emerald -- --check
   ```

2. Close existing mGBA instances, then launch the configured mGBA 0.10.3 and Emerald ROM:

   ```powershell
   npm run proof:emerald
   ```

3. If a savestate is configured, mGBA already started from it (via `--savestate`, printed by the launcher for confirmation — no manual load needed). Open **Tools > Scripting...**, load `adapters/gen3-mgba/emerald-acquisition.lua`, and confirm the configured source snapshot appears with contract version `1.0.0`.

4. Open a second PowerShell terminal at the repository root and run the environment assignments and `npm run live:emerald` command printed by the launcher.

5. Confirm the mapper reports `Mapped Emerald source snapshot` and that `public/live-state.json` parses. It should contain live species ID, level, current/max HP, battle state/opponent data, and raw location identifiers alongside the documented placeholders.

6. Open a third terminal and run the printed `PORT` assignment and `npm start` command.

7. Open the URL printed by the launcher. Confirm the party card shows the live level and HP with `Species name unavailable`, `unknown` type, zero stats, and no moves.

8. Take damage or heal the first party Pokemon. Confirm the source snapshot, `public/live-state.json`, and rendered HP all change without restarting mGBA, mapper, or server.

9. Enter and leave a battle. Confirm the fixed opponent appears and disappears. Change maps and confirm the raw values under `extensions.pokemon.emerald.us-rev0.mgba.acquisition.location` change; `location.name` remains the explicit placeholder.

10. Stop the mapper and server with **Ctrl+C**. `public/live-state.json` and `var/snapshots/` are runtime files ignored by Git.

For a source-fixture preflight without mGBA, set `EMERALD_SOURCE_SNAPSHOT_PATH` to `adapters/gen3-mgba/fixtures/emerald-us-rev0.source.json` and run `npm run live:emerald -- --once`.

## Source Snapshot Shape

The canonical schema is authoritative. A representative source snapshot is:

```json
{
  "contract": { "id": "pokemon.emerald.us-rev0.mgba.acquisition", "version": "1.0.0" },
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

The fixtures contain synthetic numeric/derived values only. They contain no ROM, BIOS, save, savestate, or copied game bytes. `npm test` verifies fingerprint rejection, decoding, source and mapping schemas, reader-to-contract output, target validation, renderer safety, unsupported-ROM refusal, and complete-file replacement behavior. It also pins Lua contract constants and write operations to the tested reference.

## Known Limitations

- Only the exact English retail Rev 0 fingerprint is accepted.
- mGBA 0.10.3 is the only emulator build verified for this task.
- The contract has no timestamp/freshness metadata; file modification time is local handoff metadata, not contract data.
- The local file is a single-writer snapshot handoff, not a general transport or event stream.
- Only the first party and first enemy-party records are read.
- Required names, types, stats, moves, location name, bag, TM, and encounter fields are placeholders, not live values.
- Species names, double-battle active slots, transient loading states, and broader corruption/plausibility checks are deferred.
- The Lua script constructs the fixed schema shape but cannot run Ajv inside mGBA; tests validate the mirrored Node output and pin shared constants/handoff operations, but CI cannot execute mGBA's embedded Lua runtime.
- The launcher validates paths and process setup but cannot verify the mGBA version, ROM fingerprint, Lua runtime, or live memory until the script runs. It deliberately does not automate mGBA GUI actions.

## Recommended Next Task

Run and independently record the first real mGBA end-to-end smoke against this pipeline, then scope additional acquisition/mapping for the P05 fields that remain unavailable. Keep whole-party iteration and lookup datasets in separately reviewed tasks.
