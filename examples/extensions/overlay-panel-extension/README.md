# Example Overlay Panel Extension

This is a template for optional UI panels.

Use this for route encounter views, capture panels, damage panels, score panels, or facility-specific displays.

Use qualified semantic slot IDs for domain-specific placement preferences, such as `pokemon.battle`. Existing unqualified slot IDs remain valid for compatibility; see `docs/knowledge/ui-extension-model.md`.

## Responsibilities

- Consume normalized state and engine/analysis outputs.
- Document required state fields.
- Keep layout accessible and responsive.
- Degrade gracefully when optional data is missing.

## Not Responsible For

- Emulator memory reads.
- Data extraction.
- Core calculations.

