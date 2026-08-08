# Domain Extensibility

The project is moving toward a domain-neutral telemetry and interaction platform with Pokemon as the first supported domain and proving ground.

## Current Boundary

The first concrete domain package now lives at `src/domains/pokemon/`. It owns:

- Type effectiveness data and calculation.
- Damage range and projected incoming-damage calculations.
- Capture and bag-ball chance calculations.
- The canonical Pokemon normalized-state schema at `src/domains/pokemon/schemas/overlay-state.schema.json`.
- Named state-contract metadata exposed through `pokemonDomain.stateContract`.

`src/platform/domain-registry.js` is the minimal domain-neutral boundary. It accepts explicitly supplied domain packages and resolves them by stable domain ID. `src/domains/index.js` is the current application composition root and registers `pokemon`; shared platform code does not import the Pokemon implementation.

The registry owns structural descriptor-container immutability as a platform guarantee, not a per-domain convention. A top-level domain descriptor must be a plain object with either `Object.prototype` or a null prototype. Registration freezes that object and every reachable plain-object/array container in place through own enumerable string-keyed properties, including mutable descendants beneath already-frozen containers. Descriptor and calculator-function identity are preserved. Functions, class instances, Maps, Sets, and other nested non-container values are left untouched; executable behavior and closed-over mutable state remain trusted, repository-reviewed code rather than part of the structural freeze guarantee.

Compatibility re-exports remain under `src/engine/` so existing imports do not break during incremental migration. The current overlay resolves the Pokemon package through the application boundary.

The former platform schema path, `src/schemas/overlay-state.schema.json`, remains a compatibility `$ref` only. It contains no independently maintained Pokemon payload fields. New integrations should use the canonical domain path and schema ID.

Pokemon-specific code still outside the package:

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
      schemas/
        overlay-state.schema.json
```

Future Pokemon-owned areas may include:

```text
src/domains/pokemon/
  overlay-panels/
```

The state schema moved wholesale rather than gaining a platform envelope because current consumers use its direct payload and the mapping runtime already identifies targets through opaque named/versioned descriptors. See ADR 0015. Overlay panels should move only through a separately scoped slice with its own compatibility decision.

Pokemon games should share one Pokemon domain. Future composition should layer generation/mechanics, game configuration, and revision/ROM-hack/mod overrides where they genuinely differ. This slice does not define those package contracts. A second domain should be added only when a real game integration can prove the boundary. The workbench could then create extensions against a selected domain. Platform mapping projects identify source and target contracts without hardcoding domain payloads. Future event detection should sit above normalized domain state rather than expose source memory semantics directly.

## Rule

Do not make Pokemon logic vague just to support unknown future games. Keep Pokemon support strong inside the Pokemon domain, and keep shared platform contracts domain-neutral. Platform mapping schemas and expression evaluators must not contain Pokemon field names or payload assumptions.
