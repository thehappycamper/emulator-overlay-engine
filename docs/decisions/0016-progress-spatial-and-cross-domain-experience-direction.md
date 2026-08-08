# ADR 0016: Progress, Spatial Context, And Cross-Domain Experiences As Future Direction

Date: 2026-08-08

Status: accepted

Extends: ADR 0013 and ADR 0014

Reaffirms: ADR 0015

## Context

ADR 0013 established normalized semantic events as a future platform primitive. ADR 0014 established future session verification and provider-capability direction. The product vision now also needs durable boundaries for progress, maps, scoring, cross-domain sessions, and interoperability with general-purpose automation systems.

Without explicit direction, future work could incorrectly put game semantics into webhooks or workflow tools, define one scoring formula for every game, require identical games for every session, conflate graphical maps with progression, or create one Pokemon domain per game.

## Decision

Record the following as future platform direction. Canonical detail lives in `../knowledge/product-vision.md`; this ADR records boundaries, not contracts.

- EOE's internal engine should own gameplay semantics, semantic-event detection, rules, permissions, session policy, provider-capability checks, and native action execution. General-purpose systems such as n8n, Node-RED, Home Assistant, and custom services may interoperate through generic event/action integration surfaces, but do not replace or become required dependencies of that engine.
- Progress should be a first-class ruleset/session output normalized to a comparable completion range. Domain- or ruleset-specific providers define what progress means; platform core does not define a universal denominator.
- Progression graphs may describe objectives, prerequisites, branches, reachability, and completion paths. Spatial maps describe where things are. They are separate optional capabilities, and progress must not require a graphical map.
- A common session result may expose comparable outcomes while scoring remains domain- and ruleset-specific. Sessions may have numeric scores, completion order, objective counts, survival outcomes, team completion, or no point total.
- Rulesets may be domain-specific or cross-domain. Cross-domain objective translation belongs to the rules/session layer. Domain events retain rich semantic meaning while sessions consume only the common progress/result concepts they require.
- Session score measures one configured challenge. A future player rating estimates matchmaking skill across sessions. Raw session points are not a global rating.
- Pokemon remains one domain composed with generation/mechanics, game configuration, and revision/ROM-hack/mod overrides. Shared Gen III behavior should be reused rather than copied across Ruby, Sapphire, Emerald, FireRed, and LeafGreen.

ADR 0014's same-game-revision example applies only to sessions whose selected ruleset requires identical environments. It is not a universal multiplayer constraint; cross-domain rulesets may define different compatibility and objective mappings.

## Non-Decisions / Explicitly Deferred

This ADR does not define or implement:

- Progress, result, score, rating, map, location, progression-graph, rule, event, action, or session schemas.
- Progress formulas, denominators, event names, action names, or objective identifiers.
- An internal rules engine, action router, provider-capability runtime, inbound Action API, or external integration.
- Webhooks, WebSocket, MQTT, local IPC, n8n, Node-RED, Home Assistant, maps, ETA estimation, sessions, matchmaking, spectator services, or cloud services.
- Pokemon generation/game/revision package contracts.

Each requires a separately approved architecture and implementation task.

## Consequences

- Future progress and result contracts must allow rulesets to supply meaning without hardcoding one game or scoring formula into platform core.
- Future spatial contracts must allow domain-specific hierarchies and coordinate models.
- Future external action requests require authentication/authorization, session policy, and provider-capability checks.
- Cross-domain sessions can compare normalized progress/results without discarding domain semantics.
- Current runtime, schemas, tests, mappings, overlays, and phase gates remain unchanged.
