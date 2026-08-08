# ADR 0009: Shareable Templates As User-Facing Packages

Date: 2026-08-08

Status: accepted

## Context

Extensions are useful technical units, but users need a simpler concept for saving and sharing a complete overlay setup for a game.

A usable setup may include emulator integration, game mappings, data packs, calculated fields, mechanics overrides, UI panels, and fixtures.

## Decision

Use templates as the user-facing shareable package concept.

Templates can bundle one or more extensions plus mapping metadata, calculated fields, fixtures, and UI layout preferences.

The Extension Workbench should eventually let users export templates that are reviewable as normal files and shareable through GitHub.

## Consequences

- Public contribution becomes easier to explain.
- Extensions remain modular under the hood.
- The workbench has a clear export target.
- Template validation and installation flows need future implementation.

