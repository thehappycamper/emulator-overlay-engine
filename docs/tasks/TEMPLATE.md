# <PhaseID>-T<NNN>: <Title>

- **Task ID:** `<PhaseID>-T<NNN>`
- **Phase:** `<PhaseID>` — <Phase Name> (see [implementation plan](../project/implementation-plan.md); this template lives at `docs/tasks/TEMPLATE.md` — actual task files under `docs/tasks/<PhaseID>/` are one level deeper and should link `../../project/implementation-plan.md` instead)
- **Status:** planned | active | blocked | review | ready-to-merge | completed | cancelled
- **Owner:** <agent/human name, or "unassigned">
- **Branch:** `<task-branch-name>` (repository-changing tasks must not be developed directly on `main` — see `AGENTS.md`'s Branching And Releases)
- **Worktree/Clone Isolation:** <path or "not needed — no concurrent agent shared this working tree", filled in only if isolation was required>

## Objective

What this task delivers, in one or two sentences.

## Why This Task Exists

The motivation — what gap, finding, or plan step this closes. Link to an ADR, a review finding, or a phase exit-criterion if applicable.

## Dependencies

What must exist or complete before this task can start or finish. Reference other task IDs or phase gates.

## Scope

What is actually being changed — files, modules, contracts.

## Non-Goals

What this task explicitly does not do, to prevent scope creep and to tell a reader why something adjacent wasn't touched.

## Acceptance Criteria

Concrete, checkable conditions for calling this done.

## Implementation Notes

Working notes, decisions made mid-task, anything a resuming agent would need. Keep current while the task is active.

## Files/Modules Expected

Paths likely to change.

## Tests Required

What must be run/added, and (on completion) the actual results.

## Documentation Required

Which docs must change alongside this task (see `AGENTS.md`'s Documentation Checklist).

## Security/Compatibility Considerations

Only if relevant — note anything touching untrusted input, public contracts, or backward compatibility.

## Review Findings

Whether independent review was required for this task (see `AGENTS.md`'s Independent Review rule), who/what performed it, and findings with how each was resolved. If review was not required, say so and why (routine/low-risk/documentation-only). Leave the findings list empty if review occurred and found nothing.

## Result

What actually happened. Fill in once implementation is done, whether or not it's merged yet.

## Branch And Merge Lifecycle

- **Implementation commit(s):** commit hash(es) with the task's actual changes, on `Branch` above.
- **Fix commit(s):** commit hash(es) addressing review findings, if any.
- **Merge approval status:** not requested | requested | approved | changes requested. Approval comes from the project-management/owner workflow, not from the implementing agent.
- **Merge commit:** commit hash on `main` once merged. Blank until then.
- **Post-merge validation:** what was checked after merge (tests re-run on `main`, phase gate updated, etc.), or blank until merged.

## Completion Date

`YYYY-MM-DD` the task reached `completed` (i.e. merged + validated) — not the date implementation finished. Blank if not yet `completed`.

## Follow-Up Tasks

New task IDs opened as a result of this one, if any.
