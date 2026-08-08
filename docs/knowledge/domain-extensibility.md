# Domain Extensibility

The project is moving toward a domain-neutral platform with Pokemon as the first supported domain.

## Current Boundary

Pokemon-specific today:

- `overlay-state.schema.json`
- Damage calculation.
- Capture calculation.
- Party/team assumptions.
- Species, moves, IVs, EVs, abilities, items, encounters, and trainer concepts.

Shared platform:

- Extension manifests.
- Extension registry.
- Transport model.
- Workbench data import, exploration, field mapping, calculated fields, validation, preview, and export.
- UI panel slot model.
- Documentation and review workflow.

## Direction

Other games should be supported through domain packages rather than weakening Pokemon models.

Possible future layout:

```text
domains/
  pokemon/
    schemas/
    engine/
    overlay-panels/
  other-game/
    schemas/
    engine/
    overlay-panels/
```

The workbench could then create extensions against a selected domain.

## Rule

Do not make Pokemon logic vague just to support unknown future games. Keep Pokemon support strong inside the Pokemon domain, and keep shared platform contracts domain-neutral.
