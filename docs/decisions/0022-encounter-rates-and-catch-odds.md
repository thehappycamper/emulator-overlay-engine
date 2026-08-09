# ADR 0022: Location Encounter Rates And Live Catch-Odds

Date: 2026-08-09

Status: accepted

Implements: ADR 0012, ADR 0017, ADR 0020, ADR 0021

## Context

`P05-T010` (a separate, parallel task) adds a battle stat comparison built entirely from fields `P05-T009` already decoded. This task adds two genuinely new pieces of decoded state that P05-T009 did not cover: the current location's wild encounter table, and the player's Poke Ball inventory together with a live, state-aware catch-probability estimate for the current wild opponent. Both are common, high-value additions to a live Pokemon dashboard, and both require real new decoding (not just new presentation of existing fields), so they were scoped as their own task rather than folded into `P05-T010`.

## Decision

**Wild encounter data.** Add `adapters/pokemon-emerald-us-rev0/data/encounters.{json,lua}`, generated directly from `pret/pokeemerald`'s own `src/data/wild_encounters.json` (already valid JSON, not C source requiring parsing), keyed by the same `"<mapGroup>:<mapNumber>"` convention `locations.json` already uses. The mapping from `MAP_<CONST>` symbolic names to `(mapGroup, mapNumber)` pairs is derived mechanically from `data/maps/map_groups.json`'s own per-group folder-name arrays (the same source `locations.json` was built from in `P05-T009`) via the documented camelCase-to-upper-snake transform, not a hand-typed table. `readEmeraldAcquisition()` attaches `encounters` to the `location` object it already builds; no new memory read is needed, since the map group/number were already being read for `locations.json` lookup.

**Poke Ball inventory.** `struct SaveBlock1`'s `bagPocket_PokeBalls` field starts at byte offset `0x650` (confirmed directly from `pret/pokeemerald`'s `include/global.h`, which annotates this field's exact offset the same way it already annotated `flags` for badges in `P05-T009`); the next field, `bagPocket_TMHM`, starts at `0x690`, giving `(0x690-0x650)/4 = 16` four-byte `struct ItemSlot { u16 itemId; u16 quantity; }` entries. This is read by a new `readBag()` function, gated by the same `saveBlock1Readable` bounds check already used for badges (the pocket's address range is comfortably inside that check's existing bound).

**Catch-rate formula.** Transcribed field-for-field from `pret/pokeemerald`'s real `Cmd_handleballthrow` (`src/battle_script_commands.c`), not derived from memory or a secondary source:

```text
odds = floor(catchRate * ballMultiplier / 10) * (3*maxHp - 2*currentHp) / (3*maxHp)
doubled if asleep/frozen; x1.5 if poisoned/burned/paralyzed/badly-poisoned
odds > 254 => guaranteed catch
else: b = floor(sqrt(floor(sqrt(16711680/odds))))
      shakeThreshold = min(65535, floor(1048560/b))
      P(catch) = (shakeThreshold/65536)^4
```

The four-shake-check structure (`for (shakes = 0; shakes < 4 && Random() < threshold; shakes++)`) is reproduced as a closed-form `probability^4` rather than simulated, since the goal is a probability estimate for display, not a bit-exact RNG replay. This is a disclosed floating-point re-implementation of the game's integer formula (`Math.sqrt`/`Math.floor` instead of the game's own integer `Sqrt()` called twice); values in this range have no meaningful precision loss versus IEEE-754 doubles, and the formula was independently sanity-checked against a well-known reference case (catchRate 45, Poke Ball, full HP, no status: computed odds `15/255`, ~6.1% catch chance, matching widely-cited community figures for that exact scenario).

Each of the twelve Gen III Poke Ball item IDs is classified in a new `balls.{json,lua}` reference table by how its multiplier is determined:

- **`guaranteed`** - Master Ball (always catches; handled as a special case rather than forced through the generic multiplier table, since the real code's handling of Master Ball's multiplier lookup could not be confirmed to resolve correctly - see Non-Goals).
- **`static`** - Poke/Great/Ultra/Luxury/Premier Ball (fixed multiplier, always computable).
- **`type-conditional`** - Net Ball (Water/Bug bonus; computable, since opponent types are already decoded).
- **`level-conditional`** - Nest Ball (lower-level bonus; computable, since opponent level is already decoded).
- **`unavailable`** - Dive Ball (needs underwater map-type detection), Repeat Ball (needs a per-species Pokedex "already caught" flag), Timer Ball (needs the battle turn counter), Safari Ball (needs a distinct Safari-Zone catch factor) - none of these are decoded by this project, and each is marked with an explicit `reason` rather than given a guessed or default multiplier.

`readBag()` computes `catchChance` per ball **only** during an active, non-trainer (wild) battle, using the already-decoded wild opponent's `catchRate`/`types`/`level`/`currentHp`/`maxHp`/`status`. Outside of battle, or during a trainer battle, every ball's `catchChance` is `null` - not zero, not omitted, `null`, so a consumer can distinguish "not applicable right now" from "computed and it's actually 0%."

**Architecture boundary.** `resolveBallMultiplier`/`calculateCatchChance` live in `adapters/pokemon-emerald-us-rev0/reference-data.js` (game-owned acquisition layer), and are called from `readEmeraldAcquisition()` in `emerald-us-rev0.js` - the same layer that already computes other derived-from-raw-bytes fields (`expProgress`, `status`, `gender`). `src/domains/pokemon/presentation.js` only formats an already-computed `catchChance` number; it contains no Emerald-specific formula of any kind. This preserves the existing "shared Emerald decoding/lookup knowledge belongs under the game-owned acquisition layer, not presentation" rule from `P05-T009`/ADR 0021.

**Schema evolution.** Smallest principled additions again: `pokemon` gains optional `catchRate`; `battle` gains required `trainerBattle` (a boolean the acquisition layer always computes, so it is not a partial/sometimes-present field); `location.encounters` and top-level `bag` were **already present** in the target schema (`overlay-state.schema.json`) from before `P05-T009`'s presentation redesign temporarily stopped using them - this task fills them with real data again rather than inventing new shape, and adds the one genuinely new field, `bagItem.catchChance`. The source schema's `bag`/`sourceEncounter`/`sourceBallSlot` `$defs` are new but mirror the target shape field-for-field (using `id` rather than `itemId` specifically to match the target's pre-existing `bagItem.id` convention, not the other way around).

**Presentation.** Two new collapsed-by-default panels, matching `P05-T010`'s "useful reference, not permanent screen space" pattern: "Wild Encounters Here" (always shown when location data exists; an explicit "no wild encounters" message for towns/buildings rather than an empty table) and "Poke Balls" (shown **only** when `battle.trainerBattle === false` explicitly - not merely "not `true`" - since an unknown/absent value must never be treated as confirmed-wild, given that showing ball-throw odds during an actual trainer battle would be actively misleading).

## Non-Goals

- Master Ball's exact multiplier-table interaction in the real C code could not be fully confirmed from the excerpt read (its item ID is lower than `ITEM_ULTRA_BALL`, which the visible `sBallCatchBonuses[gLastUsedItem - ITEM_ULTRA_BALL]` indexing expression would underflow for) - handled here as an unconditional 100% guaranteed catch instead, which is long-established, undisputed Pokemon game knowledge independent of that specific code path.
- Dive/Repeat/Timer/Safari Ball multipliers remain unavailable, per the reasons in their `balls.json` entries - tracked as follow-up work, not guessed at.
- No bag pockets other than Poke Balls are decoded (general items, key items, TMs, berries) - out of scope; the request was specifically about Poke Balls and catch odds.
- No UI to actually throw a ball or take any battle action - this remains a read-only diagnostic/informational display, consistent with every other part of this project's scope guard against adding action/input control.

## Consequences

- The dashboard can show what's catchable nearby (wild encounter table) and a live, state-aware estimate of how likely each owned ball is to catch the current wild opponent, using only real, source-verified formulas and data.
- Both providers (mGBA, BizHawk) gain this identically through the one shared Lua module, mirroring `emerald-us-rev0.js` field-for-field; the Lua port of this task's additions carries the same disclosed "not executed, no Lua interpreter in this environment" limitation as the rest of that module.
- A future permissions/ruleset layer (not designed here) may want to restrict catch-odds/encounter visibility for certain challenge modes (e.g., "blind" nuzlocke-style rules) - noted as a real future need, consistent with `P05-T010`'s same observation about opponent-stat visibility.
