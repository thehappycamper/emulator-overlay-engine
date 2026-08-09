# Emerald Rev 0 Reference Data (P05-T009, extended by P05-T011)

Static lookup tables resolving the raw internal IDs Pokemon Emerald stores in
memory (species, move, item IDs; map group/number) into the display names,
types, categories, and growth rates a live dashboard needs. Generated from
the real, MIT-licensed [pret/pokeemerald](https://github.com/pret/pokeemerald)
decompilation project's own source (master branch, fetched 2026-08), not
typed from memory - see `docs/tasks/P05/P05-T009.md`'s Implementation Notes
for the exact source file each table came from and how each was
independently sanity-checked (known species/moves/formulas cross-checked
against the real header/source values, not just re-running the generation
script against itself).

Each table exists in two forms:

- `*.json` - loaded by `../reference-data.js` (Node `readFileSync` + `JSON.parse`).
- `*.lua` - loaded by `../emerald-acquisition.lua` via `loadfile()`, so the
  live Lua connectors (mGBA, BizHawk) do not need a JSON parser.

Both forms are generated together from the same source data; they are not
hand-maintained separately, and are expected to always match.

| File | Contents |
| --- | --- |
| `species.json` / `species.lua` | Internal species ID -> `{name, types, growthRate, genderRatio, catchRate}` (385 species; a small number of internal ID gaps, e.g. some Unown letter forms, are not present and resolve to `nil`/`undefined` - a disclosed, not silently guessed, gap). `catchRate` added by P05-T011 for live catch-odds computation. |
| `moves.json` / `moves.lua` | Internal move ID -> `{name, type, category, power, accuracy, pp}` (354 moves). `category` is derived from `type` via the documented Gen I-III physical/special-by-type split (`type < TYPE_MYSTERY` is physical), not a separate per-move lookup - Gen III does not store category per move. |
| `items.json` / `items.lua` | Internal item ID -> display name (318 items; TMs/HMs and a few other entries follow a different source pattern and are not included - not relevant to held-item display, which is this table's only current use). |
| `locations.json` / `locations.lua` | `"<mapGroup>:<mapNumber>"` -> a readable name mechanically derived from the real per-map folder name (e.g. `PetalburgCity` -> `Petalburg City`), not a hand-typed list (518 entries, full coverage of both overworld and indoor maps). |
| `charmap.json` / `charmap.lua` | Gen III in-game text byte -> character, for decoding nicknames (248 mapped byte values). |
| `encounters.json` / `encounters.lua` (P05-T011) | `"<mapGroup>:<mapNumber>"` -> array of `{method, speciesId, name, minLevel, maxLevel, rate}` wild encounter slots, taken directly from `pret/pokeemerald`'s own `src/data/wild_encounters.json` (81 locations with standard grass/surf/rock-smash/fishing encounters; towns/buildings/other maps with no wild encounters simply have no entry). |
| `balls.json` / `balls.lua` (P05-T011) | Internal item ID (1-12, the 12 Gen III Poke Ball types) -> catch-multiplier metadata (`kind`: `guaranteed`/`static`/`type-conditional`/`level-conditional`/`unavailable`, plus the relevant multiplier fields), transcribed from `pret/pokeemerald`'s real `Cmd_handleballthrow` (`src/battle_script_commands.c`). Balls whose real bonus depends on state this project does not decode (Dive/Repeat/Timer/Safari Ball) are marked `unavailable` with a `reason`, never given a guessed multiplier. |

No ROM, save, savestate, or copied game asset lives here - these are name/
metadata tables (the same category of public game-fact data as the species/
move names any Pokemon reference site or tool publishes), not copied
copyrighted game code or media.
