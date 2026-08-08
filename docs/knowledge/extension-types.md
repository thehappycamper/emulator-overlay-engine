# Extension Types

Extensions are the scalability boundary for emulator support, game support, domain data packs, scoring rules, analysis modules, overlay panels, and transports.

Every extension should include:

- `extension.json`
- `README.md`
- Public-safe fixtures when useful
- Tests when behavior is executable

The extension manifest schema lives at:

```text
src/schemas/extension.schema.json
```

Templates can bundle multiple extensions into a user-facing shareable overlay setup. See `docs/knowledge/shareable-templates.md`.

## Type Taxonomy

| Type | Owns | Should Not Own |
| --- | --- | --- |
| `emulator` | Emulator connection, Lua/API/file export, emulator setup | Game data, battle math, UI layout |
| `game` | Generation/game/ROM/hack memory maps and ID mapping | Emulator connection, generic calculators |
| `data` | Species, moves, items, learnsets, encounters, trainers, facility sets | Memory reads, UI layout |
| `mechanics` | Formula/rules differences for a generation or hack | Raw ROM assets, emulator setup |
| `calculator` | Custom calculations such as battle damage, catch odds, stat projection, learnset availability | Raw data ownership, emulator reads, UI layout |
| `ruleset` | Challenge scoring rules and event interpretation | Emulator reads, core battle math |
| `analysis` | Higher-level decision modules such as set matching or move prediction | Data ownership, UI layout |
| `overlay-panel` | Optional visual panels using normalized state and engine outputs | Emulator reads, data extraction |
| `transport` | File polling, WebSocket, HTTP, or bridge protocols for state movement | Domain calculations, game mappings |

UI extensions should use the panel slot model documented in `docs/knowledge/ui-extension-model.md`.

## Composition Examples

Vanilla Emerald mGBA live overlay:

```text
emulator: mgba
game: pokemon-emerald-us
data: gen3-vanilla
mechanics: gen3
calculator: pokemon-battle-calculators
transport: file-state
overlay-panel: battle-dashboard
```

ROM hack challenge overlay:

```text
emulator: mgba
game: run-and-bun-1.07
data: run-and-bun-1.07
mechanics: run-and-bun-1.07
calculator: run-and-bun-calculators
ruleset: low-score-nuzlocke
analysis: trainer-set-matcher
overlay-panel: route-and-capture
```

## Core Rule

If a feature exists because of a specific emulator, game, ROM hack, ruleset, or UI panel, prefer an extension. If a feature is domain-specific, it belongs in a domain package. If it is generic extension, transport, workbench, or overlay-host infrastructure, it belongs in shared platform code.
