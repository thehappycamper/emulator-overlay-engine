# Extensions

Extensions add support around the core engine without hardcoding source-specific behavior into core modules.

## Extension Types

| Type | Purpose |
| --- | --- |
| `emulator` | Reads or exports live state from a specific emulator. |
| `game` | Maps a generation/game/ROM memory layout into normalized state. |
| `data` | Supplies static or extracted data such as encounters, moves, learnsets, trainers, or facility sets. |
| `mechanics` | Supplies generation or ROM-hack formula/rule differences. |
| `calculator` | Adds custom calculations such as damage, catch odds, stat projection, or learnset availability. |
| `ruleset` | Defines challenge scoring rules and event interpretation. |
| `analysis` | Adds decision-support logic such as set matching or move prediction. |
| `overlay-panel` | Adds an optional UI panel that consumes normalized state and engine outputs. |
| `transport` | Moves normalized state between adapters and overlays. |

## Rules

- Extensions must map into the normalized API instead of forking core behavior.
- Each extension should include an `extension.json` manifest.
- Manifests should follow `src/schemas/extension.schema.json`.
- Each extension should include a README with setup, supported versions, exported fields, limitations, and data sources.
- Public extensions must not include ROMs, BIOS files, copyrighted game assets, personal saves, secrets, or local absolute paths.

## Examples

See `examples/extensions/`.
