# Feature Inventory

Status labels:

- `planned` - intended, not started.
- `mvp` - implemented in first static form.
- `active` - being implemented or partially wired.
- `blocked` - needs data, emulator support, or a decision.

## Implemented MVP

| Feature | Status | Notes |
| --- | --- | --- |
| Normalized overlay state schema | mvp | `src/schemas/overlay-state.schema.json` |
| Static browser overlay | mvp | Reads sample JSON and renders party, opponent, route, catch, score, seed/frame |
| Type effectiveness | mvp | Gen 2/3 style type chart in `src/engine/type-chart.js` |
| Damage range calculator | mvp | Basic level/stat/power/STAB/type/roll support |
| Projected switch-in damage | mvp | Calculates incoming opponent damage against each party member |
| Capture chance calculator | mvp | Basic Gen 3 style ball/status/HP odds |
| CI test workflow | mvp | `.github/workflows/ci.yml` |
| Extension manifest schema | mvp | `src/schemas/extension.schema.json` |
| Extension templates | mvp | `examples/extensions/` |
| Calculator extension type | mvp | Template for custom calculations like damage, catch odds, stat projection, and learnset availability |
| Fusion/custom species metadata | mvp | Schema supports optional `display`, `components`, and `sourceIds` |
| Namespaced extension runtime state | mvp | Top-level `extensions` object in normalized state |

## Planned Core Features

| Feature | Status | Notes |
| --- | --- | --- |
| Live party panel | planned | Needs emulator extension export |
| IV/EV display | planned | Existing local Gen 3 Lua script can supply this |
| Current moves and PP | planned | Existing local Gen 3 Lua script can supply this |
| Learnset upcoming moves | planned | Needs data extension tables |
| Bag TMs and compatibility | planned | Needs bag export and learnset/TM data |
| Route encounter viewer | mvp | Static sample only; needs live map ID and encounter data |
| Battle catch odds from bag | mvp | Static sample only; needs live bag/opponent export |
| Shiny/PID/seed/frame display | mvp | Static sample only; needs live export |
| Battle Factory set identification | planned | Needs vanilla/hack facility set data |
| Opponent move prediction | planned | Needs AI scoring model and battle state |
| Challenge scoring engine | planned | Needs event tracker and ruleset config |
| ROM hack adapters | planned | Needs per-hack data extraction/mapping |
| Fusion game data packs | planned | Example template exists; loader not implemented |
| Extension loader | planned | Needs decision on runtime loading and trust model |
| UI panel extension host | planned | Slot model documented; runtime not implemented |
| Extension Workbench | planned | GUI for data exploration, field mapping, calculated fields, UI mapping, preview, and extension export |
| Domain packages | planned | Future path for multiple games without weakening domain-specific logic |
| Domain-neutral platform core | planned | Shared extension/workbench/transport/UI host layer, with Pokemon as first domain |
| Shareable templates | planned | User-facing bundles of extensions, mappings, calculated fields, fixtures, and UI layout preferences |
| Template manifest schema | mvp | `src/schemas/template.schema.json` and example template under `examples/templates/` |
| Premium template marketplace | planned | Future commercial layer; not implemented and needs policy ADR before build |
