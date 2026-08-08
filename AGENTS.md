# Agent Guide

This repository is intended to be maintained by both humans and coding agents. Keep changes easy to review, easy to merge, and easy to resume later.

## Product Direction

Emulator Overlay Engine is an extensible game telemetry and interaction platform. Overlay rendering is the first visible product surface, not the architectural boundary. Pokemon is the first domain and proving ground.

The long-term direction is to turn source data into normalized state, semantic events, and experiences such as overlays, calculations, rulesets, automations, and sessions. Events, actions, sessions, multiplayer, and hosted services are not implemented. Do not imply otherwise or build them without an approved architecture slice.

> **EOE turns game state into events, and events into experiences.**

See `docs/knowledge/product-vision.md` for the canonical product direction.

## Required Agent Behavior

- Read this file before making changes.
- Check `git status -sb` before editing.
- Keep changes scoped to the requested task.
- Do not rewrite or discard user changes.
- Update documentation with every meaningful code, architecture, feature, adapter, or workflow change.
- Update `docs/project/last-worked-on.md` before finishing a work session.
- Add or update an ADR in `docs/decisions/` when changing architecture, public APIs, repository workflow, or long-term project direction.
- Update `docs/maps/code-map.md` when files, modules, or ownership boundaries change.
- Update `docs/project/features.md` when feature status changes.
- Update `docs/project/emulators.md` when emulator compatibility changes.
- Run relevant checks before committing. At minimum, run `npm test` for engine or overlay changes.
- Prefer small, mergeable commits on `main` unless a branch is needed for risky or long-running work.

## Branching And Releases

- Default branch: `main`.
- Regular work should land on `main` quickly after tests pass.
- Use short-lived branches only for risky, experimental, or multi-session work.
- Delete merged branches after merge.
- Avoid long-lived isolated branches.
- Public releases should be tagged from `main` after CI passes.

## CI Expectations

- CI must remain fast and low-friction.
- Do not add heavyweight CI gates without documenting the reason in an ADR.
- Keep tests deterministic and dependency-light where possible.
- Any new package manager, runtime, build step, or deployment system needs documentation updates.

## Architecture Rules

- Shared platform code must not read emulator memory directly.
- Emulator adapters own emulator APIs, memory addresses, and live export mechanics.
- Game/data adapters own generation, ROM, and ROM-hack mappings.
- Raw emulator and source details must remain at source/adapter boundaries; future consumers should use normalized domain state or semantic events.
- Shared platform contracts and infrastructure must remain domain-neutral. Pokemon semantics belong in the Pokemon domain boundary.
- Future event, action, and session compatibility is an architectural concern, not a requirement to add premature abstractions to every change.
- Do not add arbitrary executable behavior to data-driven mappings or templates. Preserve the safe, reviewable contract model from ADR 0012.
- Semantic event detection is future architecture above normalized state and domain interpretation; no event contract or runtime exists yet.
- Do not introduce cloud or multiplayer dependencies into local core without an explicit architecture decision. Local EOE Core must remain useful without hosted services.
- Overlay code consumes normalized state and engine outputs.
- Public schemas belong in `src/schemas/` until domain package boundaries are introduced.
- Do not hardcode ROM hack behavior into generic engine modules.
- Do not add new Pokemon-specific assumptions to shared platform code when the concept belongs in a Pokemon domain package.

## Documentation Checklist

Before finishing a task, check whether these need updates:

- `README.md`
- `docs/README.md`
- `docs/maps/code-map.md`
- `docs/project/last-worked-on.md`
- `docs/project/features.md`
- `docs/project/emulators.md`
- `docs/project/roadmap.md`
- `docs/knowledge/*.md`
- `docs/decisions/*.md`

## Current MVP

The implemented foundation is a static Pokemon-oriented normalized-state browser overlay, core damage/capture calculators, and a domain-neutral safe mapping runtime. Live emulator export, semantic events, actions, automation, sessions, multiplayer, and hosted services are not implemented.
