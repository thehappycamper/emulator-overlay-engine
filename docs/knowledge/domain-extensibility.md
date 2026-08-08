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
- Named and versioned source/target mapping contracts.
- Safe declarative field, value, and calculated-field mapping.
- Workbench data import, exploration, validation, preview, and export.
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

The workbench could then create extensions against a selected domain. Platform mapping projects identify their source and target contracts without constraining whether a target represents snapshot state, a domain record, or a future event contract.

## Rule

Do not make Pokemon logic vague just to support unknown future games. Keep Pokemon support strong inside the Pokemon domain, and keep shared platform contracts domain-neutral. Platform mapping schemas and expression evaluators must not contain Pokemon field names or payload assumptions.
