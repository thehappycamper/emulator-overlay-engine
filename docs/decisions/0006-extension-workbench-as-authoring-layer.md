# ADR 0006: Extension Workbench As Authoring Layer

Date: 2026-08-08

Status: accepted

## Context

Hand-authoring extension JSON and mapping files will be manageable for developers, but less approachable for users adding custom ROM hacks, fan games, fusion data, or UI panel mappings.

The project needs to support community data contribution without forcing all contributors to understand every internal schema by hand.

## Decision

Plan a web-based Extension Workbench as an authoring layer.

The workbench should help users:

- Explore imported or live game data.
- Map source fields to normalized fields.
- Add calculated fields.
- Preview overlay output.
- Export normal extension files for review and version control.

The workbench does not replace review or the extension file format.

## Consequences

- Extension files remain human-readable and Git-reviewable.
- Non-developer contributors can still help map new games and data.
- The workbench becomes a future product surface.
- Schema design must stay stable enough for GUI mapping.

