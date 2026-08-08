# Domain Extensibility

The project is moving toward a domain-neutral telemetry and interaction platform with Pokemon as the first supported domain and proving ground.

## Current Boundary

Pokemon-specific today:

- `overlay-state.schema.json`
- Damage calculation.
- Capture calculation.
- Party/team assumptions.
- Species, moves, IVs, EVs, abilities, items, encounters, and trainer concepts.

Implemented shared platform foundation:

- Extension manifests.
- Named and versioned source/target mapping contracts.
- Safe declarative field, value, and calculated-field mapping.
- Documentation and review workflow.

Future shared platform responsibilities:

- Extension registry and transport runtime.
- Workbench authoring, validation, preview, and export.
- Domain-neutral event contracts, subscriptions, and event transport.
- Action-provider and local automation infrastructure.
- Session infrastructure and optional hosted consumers.

Future domain responsibilities:

- Semantic interpretation of normalized domain state.
- Domain event detection and domain event definitions.
- Domain-specific rules, calculators, analysis, and panels.

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

The workbench could then create extensions against a selected domain. Platform mapping projects identify source and target contracts without hardcoding domain payloads. Future event detection should sit above normalized domain state rather than expose source memory semantics directly.

## Rule

Do not make Pokemon logic vague just to support unknown future games. Keep Pokemon support strong inside the Pokemon domain, and keep shared platform contracts domain-neutral. Platform mapping schemas and expression evaluators must not contain Pokemon field names or payload assumptions.
