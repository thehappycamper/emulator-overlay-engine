# Task Records

This directory is the repository-native execution history: what was worked on, by whom, why, what changed, what was tested, what commit closed it, and what follows. It exists so a human, Codex, Claude, or any other agent can answer "what's the state of this project?" from the repository alone, without relying on chat transcripts as project memory.

## Relationship to other project-memory documents

Three documents answer different questions. Don't duplicate content between them — link instead.

| Document | Answers | Granularity |
| --- | --- | --- |
| `docs/project/roadmap.md` | What is the product going to do, roughly in what order? | Product-level tracks, coarse |
| `docs/project/implementation-plan.md` | What is the engineering execution sequence, and what gates each phase? | Phases (`P00`, `P01`, ...) with entry/exit criteria |
| `docs/tasks/**` (this directory) | What specific work happened, task by task? | Individual tasks (`P01-T004`) — this is the history |

`docs/project/last-worked-on.md` is a short pointer to the current phase/active task/most recently completed task — not a place to re-narrate task detail. See its own header for the current pointer.

## ID scheme

Tasks are identified as `<PhaseID>-T<NNN>`, e.g. `P01-T004`. `<NNN>` is a zero-padded three-digit sequence number, assigned in the order the task was started within its phase. IDs are never reused, even if a task is cancelled.

## Directory layout

```text
docs/tasks/
  README.md          this file
  TEMPLATE.md         copy this to start a new task record
  P00/
    P00-T001.md
  P01/
    P01-T001.md
    P01-T002.md
    ...
```

One file per task, grouped by phase directory. A task belongs to exactly one phase.

## Lifecycle

1. Copy `TEMPLATE.md` to `docs/tasks/<PhaseID>/<PhaseID>-T<NNN>.md`, filling in the next unused sequence number for that phase.
2. Set `Status: planned` or `Status: active` and fill in Objective, Why, Dependencies, Scope, and Non-Goals before starting implementation.
3. While working, keep Implementation Notes current enough that another agent could resume the task cold.
4. On completion, fill in Result, Tests Required (with actual results), Commit(s), and Completion Date. Set `Status: completed`.
5. If work stalls on an external decision or another task, set `Status: blocked` and say what it's blocked on in Dependencies.
6. If a task is abandoned, set `Status: cancelled` and say why in Result. Do not delete the file — it's still part of the history of what was tried.

**A task record is not a disposable checklist.** Once a task reaches `completed` or `cancelled`, its file becomes historical record. Do not rewrite a completed task's Objective/Scope/Result to match later hindsight — if the plan changed, that belongs in a new task or a note in Follow-Up Tasks, the same way ADRs get superseded rather than edited in place. See `docs/project/branding-and-renaming.md`'s Category 4 for the same rule applied to product naming.

## What belongs in a task record vs. an ADR

A task record documents *that work happened and what it did*. An ADR documents *a decision and its rationale*, per `docs/decisions/0002-documentation-as-project-memory.md`. A task that changes architecture, a public API/schema, or long-term direction should reference the ADR it's implementing (or add one) — but routine implementation work does not need a new ADR just because it has a task record. Most tasks will have no associated ADR.

## Scope

This is markdown files in git. No database, no external project-management tool, no generated indices, no required issue-per-task. If a task list gets long enough that browsing the phase directories stops being enough, that's a signal to revisit — not a reason to add tooling preemptively.
