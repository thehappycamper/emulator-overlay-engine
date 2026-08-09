# ADR 0021: Emerald Live Dashboard, Reference Data, And Schema Evolution

Date: 2026-08-09

Status: accepted

Implements: ADR 0012, ADR 0017, ADR 0018, ADR 0020

Fulfills: the placeholder-replacement follow-up named in ADR 0019's Consequences ("Species/move/map lookup data can replace placeholders in later mapping/data tasks without redesigning acquisition")

## Context

`P06-T002` gave both providers a shared, validated `pokemon.emerald.us-rev0.acquisition@1.0.0` snapshot, but the mapping and overlay still only used the first party slot, one opponent, and literal placeholder text (`Species name unavailable`, `Location name unavailable`, zero-valued stats) for everything the source didn't yet resolve. That was honest for a first proof but not yet a usable dashboard: a real player wants to see their whole team, not one slot and five placeholder cards.

The blocking gap was resolving raw internal IDs (species, move, item, map group/number) and encrypted per-Pokemon data (nickname text, gender, status, EXP, PP-with-bonus, IVs) into real values. None of that requires a running emulator to build or verify against known-correct math and known-correct lookup data; it requires accurate reference data and correct decoding, both independently verifiable from the same public decompilation project already used for the existing address/struct layout.

## Decision

Add a game-owned static reference-data layer under `adapters/pokemon-emerald-us-rev0/data/` (species/moves/items/locations/charmap, as both `.json` for the JS acquisition module and `.lua` for the Lua providers, generated together from the same source so they cannot silently drift) and a corresponding `reference-data.js` module exposing lookup and decode helpers (`lookupSpecies`, `lookupMove`, `lookupItem`, `lookupLocation`, `decodeGen3Text`, `decodeStatusCondition`, `deriveGender`, `calculateMaxPp`, `expForLevel`, `expProgress`). This keeps static game-fact data out of both emulator providers and the presentation layer, per the existing "emulator providers stay thin, shared Emerald knowledge lives in the game-owned acquisition layer" rule ADR 0020 established.

Extend `EMERALD_US_REV0`'s Gen III decode to read all `partyCount` party slots (not one fixed slot), nickname/status/individual battle stats/badges, and the three previously-unused encrypted substructs (Attacks, EVs/Condition, Misc — the Growth substruct alone was decoded before this task), then resolve species/move/item/location names, gender, status label, EXP progress, and PP-with-bonus through the new reference-data layer before the snapshot is published. None of this changes the address/struct verification ADR 0020 already established; it uses the same verified struct layout and adds the three sibling substructs plus the lookup step.

Evolve the source, target, and mapping contracts as the **smallest principled extension**, not a breaking redesign:

- The target (`overlay-state`) schema loosens rather than tightens: `move` now requires only `["id","name"]` (was `["id","name","type","category","power"]`), and previously-fixed fields (`name`, `types`, `item`) become nullable. A consumer written against the *old*, stricter required-field set still accepts every value the new mapping produces, because loosening a schema is backward compatible in the direction that matters here (producers, not readers, changed). New optional fields (`gender`, `exp`, `expProgress`, `currentPp`, `maxPp`, `badges`) are additive; no existing field was removed or renamed.
- The source (`emerald-us-rev0-source`) schema's `party` gains a `slots` array (up to 6) alongside the existing single-record shape it already had informally; `sourcePokemon` gains the new decoded fields as optional additions.
- The mapping project version increases (`1.x` to `2.0.0`) because its *behavior* changes materially (whole party instead of one fixed slot, real names instead of literal placeholders), even though the schema changes underneath it are additive. The mapping's own declarative, non-executable structure (ADR 0012) is unchanged; it simply has more field-mapping entries, generated (not hand-duplicated) for six party slots plus the opponent from one shared per-Pokemon field list.
- The literal-placeholder pattern ADR 0019 established is retained only where genuine absence remains possible: `location.name` still falls back to a literal `"Unknown location"` string (never a fabricated real place name) when the save block region is unreadable, and `player.badges` is now omitted (`null`) rather than forced to an all-`false` array when unreadable, so "unknown" is never confused with "none obtained."

Rewrite `src/domains/pokemon/presentation.js`/`.css` as a compact six-slot team dashboard plus a separate battle panel, reusing the existing `damage.js` projection logic unmodified. The prior single-party-card, seed/frame/score, catch-odds, and route-encounters presentation is intentionally dropped rather than preserved, because none of the removed data is genuinely available from the acquisition layer today, and rendering placeholder cards for it would violate the "do not fake unavailable values" rule this task was explicitly given. Presentation contains no game-fact lookups of its own; every name shown was already resolved by the acquisition layer.

Port the same field-for-field decode/lookup logic to `adapters/pokemon-emerald-us-rev0/emerald-acquisition.lua`, the one shared Lua module both `adapters/gen3-mgba/emerald-acquisition.lua` and `adapters/bizhawk/proof-connector.lua` already `loadfile()` (per ADR 0020). The Lua module now also loads its five reference-data tables via `loadfile()` on the generated `.lua` files, taking its data directory as an explicit first argument (`loadfile(modulePath)(dataDir)`) rather than relying on `debug.getinfo`, which can be sandboxed in a BizHawk Lua host. **This Lua port has not been executed** — no Lua interpreter is available in this development environment — and is verified only by manual review and structural brace/paren-balance checks against the independently unit-tested JS implementation it mirrors. This is a disclosed gap, not a claimed proof; see `docs/tasks/P05/P05-T009.md`.

## Consequences

- A live dashboard can show a full six-member team with real names, types, HP, status, EXP progress, held items, and moves-with-PP, and a battle panel with a real opponent, using only data the acquisition layer can actually decode - no fabricated values anywhere in the pipeline.
- Both providers (mGBA, BizHawk) gain this identically through the one shared Lua module; no provider-specific game-semantics branch exists in either connector.
- Existing consumers of the target schema that only read the previously-required fields continue to work unmodified; nothing that validated against the old, stricter schema stops validating.
- The reference-data tables are generated artifacts of real upstream source, not hand-typed; regenerating them (a future task) should re-derive from `pret/pokeemerald` the same way, not be hand-edited in place.
- The Lua port's correctness rests on manual review, not execution, until a real mGBA or BizHawk acceptance session exercises it - this is an explicit, named risk carried forward into acceptance testing, not a resolved one.
- A handful of known-deferred fields remain out of scope: opponent battler-switch-index tracking, battle stat stages, and the roughly two dozen internal species IDs (e.g. some Unown letter forms) the source data does not resolve a name for.
