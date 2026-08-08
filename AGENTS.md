# Agent Guide

This repository is intended to be maintained by both humans and coding agents. Keep changes easy to review, easy to merge, and easy to resume later.

## Product Direction

Pokemon Overlay Engine is a generation-agnostic engine and overlay for Pokemon emulator challenge tooling.

Adapters normalize emulator and ROM-specific data into the shared state API. The core engine should stay independent from any specific emulator, generation, or ROM hack.

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

- Core engine code must not read emulator memory directly.
- Emulator adapters own emulator APIs, memory addresses, and live export mechanics.
- Game/data adapters own generation, ROM, and ROM-hack mappings.
- Overlay code consumes normalized state and engine outputs.
- Public normalized state shape belongs in `src/schemas/`.
- Do not hardcode ROM hack behavior into generic engine modules.

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

The first MVP is a static normalized-state browser overlay with core damage and capture calculators. Live emulator export is not implemented yet.

