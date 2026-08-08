# Feature Inventory

Status labels:

- `planned` - intended, not started.
- `mvp` - implemented in first static form.
- `active` - being implemented or partially wired.
- `blocked` - needs data, emulator support, or a decision.

## Implemented MVP

| Feature | Status | Notes |
| --- | --- | --- |
| Pokemon normalized state schema | mvp | Canonical domain contract at `src/domains/pokemon/schemas/overlay-state.schema.json`; former platform path is a compatibility `$ref` |
| Static browser overlay | mvp | Reads sample JSON and renders party, opponent, route, catch, score, seed/frame |
| Type effectiveness | mvp | Gen 2/3 style type chart in `src/domains/pokemon/type-chart.js` |
| Damage range calculator | mvp | Pokemon domain package; basic level/stat/power/STAB/type/roll support |
| Projected switch-in damage | mvp | Calculates incoming opponent damage against each party member |
| Capture chance calculator | mvp | Pokemon domain package; basic Gen 3 style ball/status/HP odds |
| Pokemon domain package boundary | active | Domain-neutral registry plus Pokemon-owned state schema, type, damage, and capture calculators; presentation/UI migration remains deferred |
| CI test workflow | mvp | `.github/workflows/ci.yml` |
| Extension manifest schema | mvp | `src/schemas/extension.schema.json` |
| Extension templates | mvp | `examples/extensions/` |
| Calculator extension type | mvp | Template for custom calculations like damage, catch odds, stat projection, and learnset availability |
| Fusion/custom species metadata | mvp | Schema supports optional `display`, `components`, and `sourceIds` |
| Namespaced extension runtime state | mvp | Top-level `extensions` object in normalized state |
| Mapping project schema | mvp | Domain-neutral named/versioned source and target contracts in `src/schemas/mapping.schema.json` |
| Safe calculated expressions | mvp | Whitelisted JSON AST with no arbitrary JavaScript execution |
| Executable mapping pipeline | mvp | Direct fields, ID/value maps, calculated fields, and validation hooks |
| Repository schema validation | mvp | `npm test` validates extension, template, mapping, and normalized-state examples |

## Planned And Future Features

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
| Extension Workbench | planned | GUI authoring layer; executable mapping contract now exists, but no GUI is implemented |
| Second-domain proof | planned | Validate shared contracts against a non-Pokemon game after the domain boundary exists |
| Domain-neutral platform core | planned | Remaining shared registry, transport, Workbench, and UI-host infrastructure |
| Normalized event contract | planned | Future domain-neutral event envelope; schema not designed yet |
| Semantic event detection | planned | Derive domain meaning from previous/current normalized state |
| Event bus and subscriptions | planned | Future local event distribution after the event contract is proven |
| Action-provider contract | planned | Future extensible boundary for overlay, audio, OBS, HTTP, MQTT, IPC, and hardware bridges |
| Local automation rules | planned | Future event-to-action rules; no authoring or runtime exists |
| Internal event/action routing | planned | Future native rules, permissions, session policy, capability checks, and action execution remain platform-owned |
| External workflow interoperability | planned | Optional webhook, WebSocket, MQTT, IPC, or authenticated Action API surfaces for n8n, Node-RED, Home Assistant, and custom services; no runtime exists |
| Local multiplayer/session engine | planned | Shared objectives, scoring, and win conditions; not emulator netplay |
| Normalized session progress | planned | Ruleset/provider-defined `0..1` completion output; no universal denominator or schema yet |
| Progress providers | planned | Future derivation from metadata, state, events, objectives, progression graphs, or seed manifests |
| Progression graphs | planned | Optional objectives, prerequisites, branches, reachability, and route-aware completion data |
| Spatial/location capability | planned | Domain-owned location meaning without assuming tiles or one global coordinate system |
| Map data and views | planned | Separate map data plus live location for objectives, routes, participants, and spectator views |
| Common session results | planned | Comparable completion/outcome surface with ruleset-specific scoring; public schema not designed |
| Cross-domain rulesets | planned | Future shared objectives and competition across different games while preserving domain semantics |
| Cross-domain objective mapping | planned | Rules/session-layer translation from rich domain events to shared objectives |
| Session Referee (verified environments) | planned | Declares/negotiates/verifies session environment (game/version/hash/seed/ruleset/modifications); see `docs/knowledge/product-vision.md` and ADR 0014 |
| Reviewed game modification registry | planned | Broader than legacy cheat-code libraries; identity, provenance, review status, mechanism, reversibility, save risk; gameplay mutation requires explicit user authorization |
| Rule enforcement spectrum | planned | Architectural distinction (observed / session-enforced / game-enforced), not public enum names yet |
| Source/provider capability advertisement | planned | Sources advertise capabilities (e.g. read, input, snapshot, modification) instead of every action assuming every source is writable; schema not designed |
| Hosted sessions | planned | Optional EOE Cloud orchestration and synchronization |
| Matchmaking | planned | Future participant discovery, separate from session/rules behavior |
| Player rating | planned | Future matchmaking estimate across sessions; intentionally distinct from one session's score/result |
| Spectator and session views | planned | Future live/session-history experiences built on normalized telemetry |
| Shareable templates | planned | Base manifest exists; full mappings/calculated-fields/fixtures embedding remains deferred |
| Template manifest schema | mvp | `src/schemas/template.schema.json` and example template under `examples/templates/` |
| Premium template marketplace | planned | Future commercial layer; not implemented and needs policy ADR before build |
