# ADR 0024: Provider-Neutral Semantic Event Derivation

Date: 2026-08-09

Status: accepted

Extends: ADR 0013

## Context

ADR 0013 established that normalized semantic events are a future platform primitive above normalized state, but deliberately deferred the event schema, detector API, and any concrete detection proof to a separately approved vertical slice. `P03` — Semantic Event Foundation — exists to deliver exactly that slice, per the implementation plan's exit criteria: a normalized event contract, at least one concrete state-transition-to-event detection proven end-to-end with tests, and no arbitrary-code-execution path.

Two shapes of design pressure apply simultaneously. First, the derivation mechanism itself must stay domain-neutral, mirroring the Provider/Domain split already established for acquisition (`docs/knowledge/adapter-contracts.md`) and for the P05-T012 proof-session tooling: a shared primitive that knows nothing about Pokemon, and a domain package that owns the actual interpretation. Second, the very first concrete domain to use it is Pokemon, and Pokemon's own normalized state has a real, disclosed weakness relevant to event derivation: no live acquisition pipeline today populates a strong per-individual Pokemon identity, which matters directly for detecting a transition (e.g. HP change) against "the same" party member or opponent across two snapshots rather than against whatever happens to occupy the same array slot.

## Decision

A new `src/events/` platform module (`derive.js`, `validate.js`, `schemas/event-envelope.schema.json`) implements the domain-neutral half of event derivation:

- `deriveEvents(previousState, currentState, detectors, options)` accepts two already-validated normalized-state snapshots (never raw emulator memory, never provider-specific data) and a caller-supplied array of pure detector functions, and returns a flat, sequenced, schema-validated array of events.
- A generic event envelope (`type`, `sequence`, `detectedAt`, `subject`, `previous`, `current`, `provenance`) is defined once, is domain-agnostic in every field's shape, and is enforced by Ajv2020 in strict mode — any event a detector emits that does not validate throws immediately (fail closed), matching this project's existing "fail closed on malformed input" pattern used throughout the mapping/schema layers.
- `previousState == null` (a first-ever observed snapshot) always returns `[]` without invoking any detector, enforced centrally rather than trusted to each detector, so an agent that starts observation mid-battle with a full party never fabricates a burst of "everything just appeared" events.
- `sequence` is assigned by an injectable, session-scoped sequencer (`createEventSequencer`), so a real session can maintain one monotonic order across many `deriveEvents` calls, while tests can inject a deterministic clock.

A new `src/domains/pokemon/events.js` domain module owns the Pokemon-specific interpretation: ten detectors (`battle.started`, `battle.ended`, `pokemon.hp.changed`, `pokemon.damaged`, `pokemon.healed`, `pokemon.fainted`, `pokemon.status.changed`, `party.changed`, `location.changed`, `badge.earned`), each a pure function over `(previousState, currentState)` reading only the canonical `pokemon.overlay-state` schema. This module has no import path into any BizHawk, mGBA, or Libretro adapter code, verified by an automated test that scans the new source files for import-path coupling rather than trusting a hand-written claim.

**Party-slot and opponent identity.** `pokemonIdentityKey(pokemon)` prefers `pid:${pokemon.pid}` when a provider populates the schema's optional `pid` field, and falls back to `heuristic:${speciesId}:${nickname}` when it does not - which is every real live provider today (`adapters/pokemon-emerald-us-rev0/emerald-us-rev0.js` decodes `personality` internally for decryption but never returns it, and the Emerald mapping has no `pid` entry at all). `party[0]` (or any fixed slot index) is never treated as identity. Unique fallback keys can be compared, but when a fallback key occurs more than once on either side of a transition, all matched entries for that key are marked ambiguous and excluded from per-Pokemon HP/status/faint comparisons; conservative omission is preferable to fabricating a transition for the wrong individual. The same identity check gates opponent-vs-opponent comparison so a trainer switching to their next Pokemon mid-battle is not read as the previous opponent healing or changing status. This heuristic's real limitations - two same-species, same-nickname individuals are indistinguishable, and a species change (evolution) is read as one individual leaving and a different one arriving - are documented in code comments directly above the function and are pinned down by dedicated tests, not left implicit. If a provider ever populates `pid`, matching upgrades to that strong identity automatically with no detector code changes required.

**Events represent transitions, not conditions.** Every detector compares exactly the two snapshots it is given and derives no state of its own; deduplication (e.g. a faint firing once on the `4→0` transition and never again on a subsequent `0→0` snapshot) falls out of this statelessness rather than requiring separate "have I already emitted this" bookkeeping.

This ships alongside, not instead of, ADR 0013's still-deferred items: no event bus, no subscription model, no rules engine, and no action/automation layer are implemented here. Those remain `P04`.

## Consequences

- The event envelope schema is a public contract from this point forward; a non-additive change to it is a breaking change for every future consumer.
- Future non-Pokemon domains reuse `src/events/derive.js` unmodified and supply their own detector array and `subject`/`previous`/`current` shapes; the platform module encodes no assumption about what an entity or a value looks like.
- The heuristic party/opponent identity limitation is now a documented, load-bearing constraint on any future consumer of `pokemon.*` events (e.g. a future rules engine must not assume `party.changed`'s slot numbers are stable identities across sessions, and must not assume an evolution is a continuous individual).
- `P04` (event routing and actions) can be scoped against a real, tested event shape and detector set rather than a hypothetical one.
