# ADR 0003: Prefer Main-First Development

Date: 2026-08-08

Status: accepted

## Context

The project should ship updates regularly and avoid losing work in isolated branches. CI should protect `main` without making contribution flow heavy.

## Decision

Use `main` as the primary integration branch. Prefer small, tested commits that land on `main` quickly.

Use short-lived branches for risky, experimental, or multi-session work. Delete branches after merge.

## Consequences

- CI should stay fast.
- Changes should be scoped and easy to review.
- Long-lived branches are discouraged.
- Release tags can be cut from `main` after CI passes.

