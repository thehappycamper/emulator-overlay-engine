# ADR 0013: Semantic Events As A Future Platform Primitive

Date: 2026-08-08

Status: accepted

Extends: ADR 0008

## Context

Emulator Overlay Engine began with a normalized Pokemon state and browser overlay. The safe mapping foundation now provides a domain-neutral path from source contracts to normalized targets, but state alone does not describe what changed or why that change matters.

Future overlays, automations, rulesets, analytics, multiplayer sessions, and hosted services need a semantic integration boundary. Exposing memory addresses, bits, or source-specific field changes directly to those consumers would couple every experience to an emulator and game implementation.

## Decision

Normalized semantic events are intended to become a first-class platform primitive above normalized state and domain interpretation.

Future event detection should compare or interpret normalized domain state and emit semantic events. Consumers should receive domain meaning, such as a gym leader being defeated, rather than raw memory semantics.

Potential event consumers include:

- Overlays and other presentation surfaces.
- Rulesets and analysis modules.
- Event subscriptions and analytics.
- Actions and automation providers.
- Local or hosted sessions.
- Optional hosted EOE services.

Automation and multiplayer should share the same normalized event foundation where practical. A local action rule and a shared session rule should not require separate source-specific detection systems for the same game occurrence.

Events are future architecture and are not implemented. This decision does not define an event schema, detector API, event bus, subscription model, action schema, session protocol, transport, or persistence model. Those require separate future architecture and implementation decisions.

## Consequences

- Normalized state remains the description of what is true now; normalized events will describe what happened.
- Raw emulator details remain confined to source and adapter boundaries.
- Domain packages will own semantic interpretation for their domains while shared platform infrastructure remains domain-neutral.
- Future action, session, and hosted layers can consume the same event meaning without depending on memory layouts.
- Current mapping, state, calculator, and overlay behavior does not change.
- The event contract and runtime must be proven in a separately approved vertical slice before downstream systems are implemented.
