# Custom Data And Fusion Games

Games with custom tables, such as fusion games or ROM hacks with expanded species, should be supported through extensions.

## Recommended Extension Set

For a fusion game, use:

```text
emulator extension: reads live state from the emulator
game extension: maps custom memory, IDs, and save/battle structures
data extension: supplies custom species, moves, items, encounters, trainers, and fusion tables
mechanics extension: supplies formula/rule changes if fusion mechanics alter stats, typing, abilities, or damage
overlay-panel extension: optional custom fusion display
```

The overlay should not need to know the original game internals. It should receive normalized Pokemon objects with enough metadata to render fused species.

## Fusion Data Model

A fused Pokemon can be represented as a normal Pokemon plus optional composition metadata:

```json
{
  "speciesId": 1000123,
  "name": "Venustoise",
  "display": {
    "name": "Venustoise",
    "form": "Fusion"
  },
  "components": [
    { "role": "head", "speciesId": 3, "name": "Venusaur" },
    { "role": "body", "speciesId": 9, "name": "Blastoise" }
  ],
  "sourceIds": {
    "gameSpeciesId": 1000123,
    "headSpeciesId": 3,
    "bodySpeciesId": 9
  }
}
```

The exact fusion formula belongs in a data or mechanics extension. The normalized output should expose the final battle-relevant values:

- Name.
- Types.
- Ability.
- Base or calculated stats when needed.
- Moves and learnsets.
- TM compatibility.
- Catch rate.
- Encounter data.

## How A User Adds Fusion Data

1. Create a new extension under `extensions/` or prepare a package using the example in `examples/extensions/fusion-data-extension/`.
2. Add `extension.json` with type `data`.
3. Document the supported game and version.
4. Add data files for fusion species, components, encounters, trainers, learnsets, and compatibility.
5. Add fixtures that show normalized state for representative fused Pokemon.
6. Add tests once loaders exist.
7. Update feature and emulator/game support docs.

## Public Repository Safety

Fusion data must not include ROMs, BIOS files, copyrighted game assets, personal saves, or secrets.

Prefer IDs, names, formulas, and derived tables. If data was extracted, document the extraction source and the target game version.

