# Extension Workbench

The Extension Workbench is a planned web interface for visually authoring reviewable EOE contracts and extensions.

The initial goal is to help users build support for new games, ROM hacks, fusion games, rulesets, and UI panels without hand-editing every JSON file. Its longer-term direction includes event detection, rules, and actions.

## Core Idea

The GUI helps users explore source data, define mappings, add calculated fields, preview normalized outputs, and export reviewable extension files.

## Executable Foundation

The first platform-level mapping contract is implemented in:

```text
src/schemas/mapping.schema.json
src/expressions/evaluate.js
src/mapping/apply.js
```

A mapping project identifies named and versioned source and target contracts. The target descriptor is deliberately open-ended: it can identify a snapshot-state contract today and a different contract category, such as a domain event, in the future.

The executable flow is:

```text
source JSON
  -> direct field mappings
  -> ID/value mappings
  -> safe calculated fields
  -> normalized target
  -> required-path and target-contract validation
```

Paths use RFC 6901 JSON Pointer. Calculated fields use a JSON expression AST rather than JavaScript strings. For example:

```json
{
  "op": "compact",
  "value": {
    "op": "array",
    "items": [
      { "op": "field", "path": "/primary_type" },
      { "op": "field", "path": "/secondary_type" }
    ]
  }
}
```

The evaluator only supports documented operations and supplied `source`, `target`, and `context` data. It cannot invoke methods, execute code, import modules, or access host globals. See ADR 0012.

`compact` follows truthiness behavior equivalent to `filter(Boolean)`. It removes missing/null values as well as other falsy values such as `0`, `false`, and empty strings; use it only when those removals are intended.

## Future Authoring Direction

Eventually the Workbench may visually author the broader product pipeline:

```text
SOURCE -> MAP -> STATE -> DETECT -> EVENT -> RULE -> ACTION
```

A future configuration might read:

```text
WHEN
Pokemon -> Gym Leader Defeated

WHERE
Gym Number = 8

DO
Audio -> Play victory sound

AND
Lights -> Flash

AND
Overlay -> Show celebration
```

Event detection, rules, actions, and automation authoring are not implemented. Their schemas and runtimes require separate decisions. The Workbench must generate human-readable, machine-readable, versioned, and reviewable contracts rather than opaque GUI-only logic or arbitrary executable template code.

After the underlying contracts exist, future authoring may also select domain/ruleset progress providers, define objectives and cross-domain objective mappings, configure spatial/map views, and connect action providers or external workflow integrations. The Workbench should help users select what progress means rather than require manual denominator arithmetic for common supported objectives. External systems such as n8n or Node-RED remain optional integrations behind generic event/action surfaces; they do not replace EOE's internal semantic, rule, permission, or action-routing layers.

None of these progress, map, scoring, session, or workflow-authoring capabilities exists today, and this direction does not define their schemas.

The workbench should generate reviewable module/extension files and user-facing templates that contributors can commit:

```text
extension.json
README.md
data/
fixtures/
tests/
```

For users, the main export should usually be a template. Under the hood, that template can bundle one or more extensions.

## Capabilities

| Capability | Purpose |
| --- | --- |
| Data import | Load CSV, JSON, extracted tables, or pasted rows. |
| Live state exploration | Inspect emulator-exported memory/state snapshots. |
| Field mapping | Map source fields to normalized schema paths. |
| ID mapping | Map custom species, moves, abilities, items, locations, and trainers. |
| Calculated fields | Define derived values such as fusion stats, display names, catch rates, or score values. |
| Validation | Check generated data against schemas. |
| Fixture generation | Save sample normalized states for tests and review. |
| UI mapping | Choose overlay slots and map fields to panel display components. |
| Preview | Render the overlay using generated extension data before export. |
| Export | Write public-safe extension files for Git review. |
| Template sharing | Save a complete game overlay setup that others can install or copy. |
| Event/rule/action authoring | Future visual authoring after contracts and runtimes are separately designed. |
| Progress/objective authoring | Future selection of progress providers and ruleset objectives after contracts exist. |
| Spatial/map authoring | Future map-data association and view configuration without assuming universal coordinates. |
| Cross-domain objective mapping | Future ruleset-layer translation of domain events into shared session objectives. |
| External workflow integration | Future configuration of generic, authorized event/action surfaces; not a replacement rules engine. |

## Data Exploration Flow

1. Import or capture source data.
2. Identify source columns, IDs, and tables.
3. Map source fields to normalized fields.
4. Add calculated fields when source data is composed or derived.
5. Validate required paths and the selected target contract schema.
6. Preview generated overlay state.
7. Export a template or module/extension package.
8. Review and commit the generated files.

## Fusion Example

For a fusion game, a user might map:

| Source | Normalized Output |
| --- | --- |
| `head_id` | `components[0].speciesId` |
| `body_id` | `components[1].speciesId` |
| `fusion_name` | `display.name` |
| `type_1`, `type_2` | `types` |
| calculated stat formula | `stats` or data extension `baseStats` |
| custom encounter table | `location.encounters` |

The output remains a normal data/game/mechanics extension. Pokemon field names belong in the selected domain mapping, not in the platform mapping schema or evaluator.

## Review Rule

The workbench is an authoring tool, not a bypass around review. Generated extensions still need:

- Public-repo safety.
- Documented source/version.
- Schema validation.
- Fixtures or tests when possible.
- Human review before merge.
