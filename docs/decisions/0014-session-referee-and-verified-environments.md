# ADR 0014: Session Referee And Verified Environments As A Future Platform Direction

Date: 2026-08-08

Status: accepted

Extends: ADR 0013 (and by extension ADR 0008)

Clarified by: ADR 0016 (identical game/revision requirements are ruleset-specific, not universal)

## Context

ADR 0013 established semantic events as a future platform primitive. Once events and sessions exist (see `docs/knowledge/product-vision.md`'s Multiplayer And Sessions), passively sharing events between participants is not enough for competitive or cooperative formats that depend on a shared, agreed-upon environment: a race or tournament needs participants to actually be playing the same game revision, seed, ruleset version, and modification set, not merely claim to be.

Separately, players already rely on informal, undocumented modification sources (historical GameShark/Action-Replay-style codes and similar) to alter gameplay. An unreviewed, ungoverned path for the platform to apply such modifications would be a serious trust and safety problem, especially combined with community-authored templates (see ADR 0012).

Any claim the platform makes about verification must also be honest about its limits: a participant fully controls their own local client, so no purely client-side declaration can guarantee the absence of cheating.

## Decision

Record the following as future platform direction. Full description lives in `docs/knowledge/product-vision.md`'s "Session Referee And Verified Environments" section; this ADR is the direction-of-record, not the design.

- A future **Session Referee** capability, layered above sessions, that can declare, negotiate, verify, and — where a source/provider explicitly and safely supports it — enforce the environment participants play under (game identity/version/revision/region, content/ROM hash, randomizer seed and tool version, ruleset ID/version, required/allowed/forbidden modifications, required provider capabilities, verification policy).
- A future **reviewed game modification registry**, described with broad terminology (game modification, patch, code module, mutation action, game helper) rather than framed as a cheat-code library, covering identity/version, supported game/revisions, purpose, provenance, review status, mechanism, required provider capability, reversibility, save-affecting risk, compatibility, and allowed competitive use.
- A three-tier **rule enforcement spectrum** as an architectural distinction: observed (detected only), session-enforced (the referee applies consequences), and game-enforced (a reviewed modification makes the rule explicit in-game where supported).
- Gameplay-affecting actions (input, save/snapshot, reviewed modification activation) are a distinct, higher-risk category from external-system actions (overlay, audio, OBS, webhook, MQTT), require explicit user authorization, and must never be assumed available — providers advertise capabilities rather than every action assuming every source is writable.
- Verification claims are described as **reproducible, verifiable session configuration and rule enforcement**, explicitly not an absolute anti-cheat guarantee.

## Non-Decisions / Explicitly Deferred

This ADR does not define, and none of the following exist yet:

- A session environment schema, verification-policy schema, or ready-check protocol.
- A trust/confidence/provenance/attestation schema for source fidelity.
- A game-modification registry manifest schema or review workflow.
- A provider-capability advertisement schema (`state.read`, `input.send`, `save.snapshot`, etc. are conceptual examples only).
- Public enum names for the rule-enforcement spectrum.
- A referee runtime, protocol, or session record/audit format.
- An implementation strategy for solo-multiplayer mechanics (e.g. trade evolution) — the use case is preserved, the mechanism is not chosen.

Each requires its own future architecture decision and implementation slice, following the same safe/reviewable/non-arbitrary-code posture ADR 0012 established for mappings.

## Consequences

- This direction is not implemented and does not change any current runtime, schema, or test behavior.
- It does not enter the near-term `P02`–`P06` sequence in `docs/project/implementation-plan.md`; it depends on the event foundation (`P03`), actions (`P04`), and a not-yet-phased provider-capability contract.
- It establishes vocabulary and constraints (broad non-cheat-code terminology, explicit user authorization for mutation, honest anti-cheat language) that future schema and runtime decisions must respect.
- Canonical detail lives in `docs/knowledge/product-vision.md`; this ADR should not be treated as a schema reference.
