# Domain Extensibility

The project is moving toward a domain-neutral telemetry and interaction platform with Pokemon as the first supported domain and proving ground.

## Current Boundary

The first concrete domain package now lives at `src/domains/pokemon/`. It owns:

- Type effectiveness data and calculation.
- Damage range and projected incoming-damage calculations.
- Capture and bag-ball chance calculations.

`src/platform/domain-registry.js` is the minimal domain-neutral boundary. It accepts explicitly supplied domain packages and resolves them by stable domain ID. `src/domains/index.js` is the current application composition root and registers `pokemon`; shared platform code does not import the Pokemon implementation.

Compatibility re-exports remain under `src/engine/` so existing imports do not break during incremental migration. The current overlay resolves the Pokemon package through the application boundary.

Pokemon-specific code still outside the package:

- `overlay-state.schema.json`
- Browser overlay rendering and party/team presentation assumptions.
- Species, moves, IVs, EVs, abilities, items, encounters, and trainer concepts.
- Pokemon examples, fixtures, and domain documentation.

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

Normalized semantic events remain future work. This boundary does not define event, action, source-provider, or session interfaces. Source acquisition also remains separate from domain interpretation through `Source Provider -> Source Contract -> Mapping -> Normalized State`.

## Direction

Other games should be supported through domain packages rather than weakening Pokemon models.

Current layout:

```text
src/
  platform/
    domain-registry.js
  domains/
    index.js
    pokemon/
      index.js
      capture.js
      damage.js
      type-chart.js
```

Future Pokemon-owned areas may include:

```text
src/domains/pokemon/
  schemas/
  overlay-panels/
```

The state schema and overlay panels should move only through separately scoped slices with compatibility decisions. A second domain should be added only when a real game integration can prove the boundary. The workbench could then create extensions against a selected domain. Platform mapping projects identify source and target contracts without hardcoding domain payloads. Future event detection should sit above normalized domain state rather than expose source memory semantics directly.

## Rule

Do not make Pokemon logic vague just to support unknown future games. Keep Pokemon support strong inside the Pokemon domain, and keep shared platform contracts domain-neutral. Platform mapping schemas and expression evaluators must not contain Pokemon field names or payload assumptions.
