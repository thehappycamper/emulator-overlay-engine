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

## Planned Core Features

| Feature | Status | Notes |
| --- | --- | --- |
| Live party panel | planned | Needs emulator adapter export |
| IV/EV display | planned | Existing local Gen 3 Lua script can supply this |
| Current moves and PP | planned | Existing local Gen 3 Lua script can supply this |
| Learnset upcoming moves | planned | Needs data adapter tables |
| Bag TMs and compatibility | planned | Needs bag export and learnset/TM data |
| Route encounter viewer | mvp | Static sample only; needs live map ID and encounter data |
| Battle catch odds from bag | mvp | Static sample only; needs live bag/opponent export |
| Shiny/PID/seed/frame display | mvp | Static sample only; needs live export |
| Battle Factory set identification | planned | Needs vanilla/hack facility set data |
| Opponent move prediction | planned | Needs AI scoring model and battle state |
| Challenge scoring engine | planned | Needs event tracker and ruleset config |
| ROM hack adapters | planned | Needs per-hack data extraction/mapping |

