# ADR 0002: Documentation Is Project Memory

Date: 2026-08-08

Status: accepted

## Context

This project will likely be maintained over many sessions by humans and coding agents. It needs to be easy to answer what changed last, why it changed, and where future work belongs.

## Decision

Maintain documentation as part of normal development work.

Agents must update relevant docs when changing:

- Architecture.
- Public APIs or schemas.
- Feature status.
- Emulator compatibility.
- Repository workflow.
- Roadmap or priorities.
- Code ownership boundaries.

Agents must update:

```text
docs/project/last-worked-on.md
```

before finishing a meaningful work session.

## Consequences

- More files may change per task.
- Reviews should consider documentation updates part of correctness.
- The repository remains easier to resume and maintain.

