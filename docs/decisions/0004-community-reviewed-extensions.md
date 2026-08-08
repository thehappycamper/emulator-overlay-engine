# ADR 0004: Community Reviewed Extensions

Date: 2026-08-08

Status: accepted

## Context

The project should support many games, emulators, ROM hacks, and challenge formats. The community can help add mappings and extensions, but the repository needs review standards to stay reliable and public-safe.

## Decision

Accept community extensions for adapters, ROM-hack mappings, data packs, rulesets, and overlay panels.

Require review before merge. Extension contributions should document supported versions, data sources, known limitations, and public repository safety.

Add `CODEOWNERS` so repository owner review is requested by default.

## Consequences

- Community support can grow without forcing all logic into core.
- Review remains required for public contributions.
- Extension docs and fixtures become part of contribution quality.
- Some contributions may need cleanup before merge if data source, license, or schema compatibility is unclear.

