# ADR 0007: Pokemon-First, Domain-Extensible

Date: 2026-08-08

Status: superseded by ADR 0008

## Context

The extension workbench model could apply to games beyond Pokemon. Users could import data, map fields, create calculated values, and build UI panels for many game types.

However, the current product goal is a Pokemon emulator overlay engine with Pokemon-specific mechanics.

## Decision

Keep the project Pokemon-first while preserving a path to domain extensibility.

Core Pokemon schemas and calculators should remain accurate and explicit. Shared infrastructure such as extension manifests, transports, workbench mapping, validation, and UI panel hosting should avoid unnecessary Pokemon coupling where practical.

If non-Pokemon support becomes real, add domain packages instead of diluting Pokemon schemas.

## Consequences

- The MVP remains focused.
- Future non-Pokemon support is not blocked.
- The workbench can be designed with reusable mapping concepts.
- Domain-specific behavior stays in domain-specific schemas and engines.
