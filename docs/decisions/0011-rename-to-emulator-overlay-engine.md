# ADR 0011: Rename Project To Emulator Overlay Engine

Date: 2026-08-08

Status: accepted

## Context

The project began as a Pokemon overlay engine. During architecture planning, the model changed to a domain-neutral emulator overlay platform where Pokemon is the first domain package/template set.

The repository name and active documentation should reflect that broader scope.

## Decision

Use `Emulator Overlay Engine` as the project name.

Use `emulator-overlay-engine` for package and repository naming.

Pokemon remains the first supported domain and MVP, but should not be presented as the permanent shared-platform identity.

## Consequences

- Active documentation should use `Emulator Overlay Engine`.
- Pokemon-specific code should move toward a domain package boundary over time.
- The GitHub repository has been renamed to `emulator-overlay-engine`.
- The local folder may also be renamed after the current working session if desired.
