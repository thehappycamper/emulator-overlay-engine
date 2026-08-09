# Agent Guide

This repository is intended to be maintained by both humans and coding agents. Keep changes easy to review, easy to merge, and easy to resume later.

## Product Direction

Emulator Overlay Engine is an extensible game telemetry and interaction platform. Overlay rendering is the first visible product surface, not the architectural boundary. Pokemon is the first domain and proving ground.

The long-term direction is to turn source data into normalized state, semantic events, and experiences such as overlays, calculations, rulesets, automations, and sessions. Events, actions, sessions, multiplayer, and hosted services are not implemented. Do not imply otherwise or build them without an approved architecture slice.

EOE is source-agnostic. Emulator memory is one possible gameplay source, not a shared-platform assumption. Core should consume source contracts whether data came from an emulator, native game API, web integration, telemetry protocol, file, existing platform, inferred vision/audio adapter, or hardware provider.

> **EOE turns game state into events, and events into experiences.**

See `docs/knowledge/product-vision.md` for the canonical product direction.

## Repository Boundary

This repository (`thehappycamper/emulator-overlay-engine`) is the **public, open-source core**. Core/public contracts live here. A separate **private** sibling repository, [`thehappycamper/gameplay-interaction-hosted-services`](https://github.com/thehappycamper/gameplay-interaction-hosted-services), owns hosted/commercial service implementation (identity, matchmaking, hosted sessions, ratings, communities, entitlements/billing, and similar). Its name is a temporary infrastructure identifier, not a final brand — see `docs/project/branding-and-renaming.md`.

Rules for agents working here:

- Do not introduce private-cloud implementation into this repository — no account/identity persistence, no billing, no hosted-session server, no database, no private service models.
- If a task appears to require hosted identity, matchmaking, billing, persistent ratings, or private service orchestration, check whether it belongs in the hosted repository instead of here.
- Cross-repository protocol changes must keep the public contract authoritative: if a hosted feature needs a new interoperability contract (an event envelope, a session message, a capability manifest), that contract is designed and versioned here, not invented privately.
- Changes affecting both repositories should be represented by separate task branches/records in each repository, cross-referenced by task ID — never a shared mutable file. See `docs/tasks/README.md`.
- Neither repository may silently modify the other's `main`.

See `docs/project/repository-boundaries.md` for the full, canonical detail: dependency direction, responsibility matrix, the Account-vs-Participant identity distinction, the local-first principle, and contract ownership.

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

`main` represents approved, integrated project state.

### Protected main

Agents must not:

- develop directly on `main`;
- commit task work directly to `main`;
- merge into `main` without explicit approval;
- force-push `main`;
- reset `main`;
- use `main` as scratch space.

### Task branches

Every repository-changing task must:

1. Start from an up-to-date approved `main`.
2. Create a dedicated short-lived task branch.
3. Make only task-scoped changes.
4. Run required tests/validation.
5. Update the applicable task/project records (see Task Governance below).
6. Commit.
7. Push the task branch.
8. Stop.
9. Report branch, commit, tests/results, task status, and review concerns.
10. Request merge approval.

Implementation completion means the task is `ready-to-merge`, not `completed`. A task becomes `completed` only after approved integration into `main` and any required post-merge bookkeeping/validation. Explicit merge approval comes from the project-management/owner workflow, not from the implementing agent deciding its own work is ready.

Normal lifecycle:

```text
main
 -> task branch
 -> implementation
 -> tests / validation
 -> push
 -> independent review where required
 -> fixes where required
 -> ready-to-merge
 -> explicit merge approval
 -> merge into main
 -> post-merge validation
 -> completed
```

- Delete merged branches after merge.
- Avoid long-lived isolated branches.
- Public releases should be tagged from `main` after CI passes.

### Concurrent agents and working-tree isolation

Branches alone are insufficient when multiple agents share the same filesystem checkout — one agent switching branches (or resetting, or leaving uncommitted changes) in a shared working tree can corrupt or confuse another agent's in-progress work.

- Agents must not switch branches in a working tree another active agent may be using.
- Agents must not carry unrelated uncommitted changes between task branches.
- For concurrent work, use **one task branch + one independent worktree or clone** per active agent/task. If a branch is already checked out in the primary working tree (`git worktree add` will refuse a second checkout of the same branch), use an independent `git clone` of the repository instead — clone from `origin`, not from the shared local checkout, so the isolated copy has no dependency on the shared tree's state.
- Do not hardcode machine-specific worktree/clone paths into documentation or scripts; a sibling directory alongside the repository (e.g. `../<repo>-worktrees/<task-branch>/`) is a reasonable convention, not a fixed path.
- Before starting work, check whether the current checkout could be in use by another agent (recent unexpected branch changes, uncommitted changes you didn't make, another branch with recent commits). If so, isolate before editing rather than after.

Preferred conceptual layout:

```text
repository-main/
    main

worktrees-or-clones/
    task-a/ -> branch A
    task-b/ -> branch B
```

## CI Expectations

- CI must remain fast and low-friction.
- Do not add heavyweight CI gates without documenting the reason in an ADR.
- Keep tests deterministic and dependency-light where possible.
- Any new package manager, runtime, build step, or deployment system needs documentation updates.

## Architecture Rules

- Shared platform code must not acquire gameplay data directly. Source providers/adapters own acquisition and expose source contracts.
- Emulator adapters own emulator APIs, emulator-specific memory-domain translation, and live export mechanics, but emulator memory must not become a platform-wide assumption.
- Game/data adapters own game addresses, packed/encrypted game structures, generation semantics, ROM/revision mappings, and ROM-hack overrides. Do not duplicate those semantics across providers for the same game target.
- Raw emulator and source details must remain at source/adapter boundaries; future consumers should use normalized domain state or semantic events.
- Preserve `Source Provider -> Source Contract -> Mapping -> Normalized State`; downstream code must not branch on acquisition method.
- Different providers may eventually need fidelity, provenance, or confidence metadata. Do not invent those fields without a separate architecture/schema decision.
- Shared platform contracts and infrastructure must remain domain-neutral. Pokemon semantics belong in the Pokemon domain boundary.
- Future event, action, and session compatibility is an architectural concern, not a requirement to add premature abstractions to every change.
- Do not add arbitrary executable behavior to data-driven mappings or templates. Preserve the safe, reviewable contract model from ADR 0012.
- Semantic event detection is future architecture above normalized state and domain interpretation; no event contract or runtime exists yet.
- Do not introduce cloud or multiplayer dependencies into local core without an explicit architecture decision. Local EOE Core must remain useful without hosted services.
- Overlay code consumes normalized state and engine outputs.
- Domain-neutral public schemas belong in `src/schemas/`; domain-specific schemas belong to their domain package. Compatibility aliases may remain in `src/schemas/` when a documented migration requires them.
- Do not hardcode ROM hack behavior into generic engine modules.
- Do not add new Pokemon-specific assumptions to shared platform code when the concept belongs in a Pokemon domain package.

## Brand-Agnostic Rule

The current product name (Emulator Overlay Engine / EOE) is temporary and intentionally undecided as a final brand. Product branding is presentation and distribution metadata, not a semantic platform concept.

- Do not introduce new brand coupling into semantic contracts, identifiers, or architecture (schema `$id` conventions, namespace/event/action naming, environment variable prefixes, module boundaries) unless an explicit decision requires it.
- Prefer neutral terms already in use (source, provider, adapter, contract, mapping, state, event, rule, action, session, domain, extension, template, view) over brand-derived names for new concepts.
- Prefer unprefixed semantic identifiers, e.g. `pokemon.badge_earned` rather than `eoe.pokemon.badge_earned`, unless a namespace decision explicitly requires a vendor prefix.
- Display text (titles, banners, doc prose) may keep using the current name; that is cheap to change later.
- See `docs/project/branding-and-renaming.md` for the full rename inventory, compatibility-sensitive identifiers, and the expected rename procedure.

## Task Governance

Implementation work beyond trivial fixes should be tracked in `docs/tasks/`. See `docs/tasks/README.md`, `docs/tasks/TEMPLATE.md`, and `docs/project/implementation-plan.md` for the phase/task structure.

- Non-trivial implementation work should have or reference a task ID (e.g. `P01-T004`).
- Update the task record during completion: status, result, tests run, and the completing commit.
- Update the owning phase's status in `docs/project/implementation-plan.md` when a phase gate changes (a phase completes, a new phase starts, or a blocking task is identified).
- Update architecture/ADR docs when the task changes architecture, public APIs, or long-term direction — routine implementation work does not require a new ADR.

### Task statuses

`planned` -> `active` -> `blocked` (if applicable) -> `review` (if applicable) -> `ready-to-merge` -> `completed`, or `cancelled` at any point.

- `ready-to-merge` means implementation, tests, and any required review are done and the branch is pushed — it is not merged and not `completed`.
- `completed` means the work is merged into `main` (with explicit approval) and any required post-merge validation/bookkeeping is done.

### Independent review

Where a task requires independent review, the implementing agent's own self-assessment does not satisfy that requirement — a separate reviewing pass (a different agent, session, or human) is needed before the task can be marked `ready-to-merge`. This role is not permanently assigned to any specific agent or tool — whichever agent or human is doing the implementing, someone else does the reviewing for tasks that call for it. Not every task needs independent review; routine, low-risk, or documentation-only tasks can skip it, and the task record should say so rather than leaving the field blank.

### Active task branch ownership

Each active task branch has one implementation owner at a time. Other agents may inspect or review the branch from isolated checkouts, but must not commit, push, rebase, reset, or force-push that branch unless ownership is explicitly reassigned or they are explicitly assigned a fix pass. Reviewers do not modify the branch they review.

### Parallel task planning

Choose parallel tasks only when their dependencies actually permit concurrent execution. Before starting a task alongside another in-progress one, check the Dependencies and Scope sections of both task records: if they touch the same files, the same schema/contract, or one's exit criteria depends on the other's output, they are not safely parallel — sequence them instead. `docs/project/implementation-plan.md`'s phase dependencies and each task record's Dependencies/Scope fields exist specifically so this check can be made without guessing.

### Task ID allocation

Before allocating a new task ID during concurrent work, inspect current remote task branches and existing task records, not just `main` — task IDs are globally unique within a repository, including unmerged active branches. This is the same coordination problem as file/branch ownership, applied to task identity: two agents working concurrently can each correctly check `main` and still collide if neither has pushed yet, so a same-instant allocation race is possible even when this check is done properly. When a collision is discovered after the fact, the earlier-claimed ID remains authoritative and the later task is renumbered — see `docs/tasks/P02/P02-T005.md`'s Implementation Notes for a worked example.

## Documentation Checklist

Before finishing a task, check whether these need updates:

- `README.md`
- `docs/README.md`
- `docs/maps/code-map.md`
- `docs/project/last-worked-on.md`
- `docs/project/features.md`
- `docs/project/emulators.md`
- `docs/project/roadmap.md`
- `docs/project/implementation-plan.md`
- `docs/tasks/**` (the task record for the work being done)
- `docs/knowledge/*.md`
- `docs/decisions/*.md`

## Current MVP

The implemented foundation is a static Pokemon-oriented normalized-state browser overlay, core damage/capture calculators, and a domain-neutral safe mapping runtime. Live emulator export, semantic events, actions, automation, sessions, multiplayer, and hosted services are not implemented.
