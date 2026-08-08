# Extension Workbench

The Extension Workbench is a planned web interface for creating and maintaining extensions.

The goal is to let users build support for new games, ROM hacks, fusion games, rulesets, and UI panels without hand-editing every JSON file.

## Core Idea

The GUI helps users explore source data, define mappings, add calculated fields, preview normalized state, and export reviewable extension files.

The workbench should generate reviewable extension files and user-facing templates that contributors can commit:

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

## Data Exploration Flow

1. Import or capture source data.
2. Identify source columns, IDs, and tables.
3. Map source fields to normalized fields.
4. Add calculated fields when source data is composed or derived.
5. Validate against schemas.
6. Preview generated overlay state.
7. Export a template or extension package.
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

The output remains a normal data/game/mechanics extension.

## Review Rule

The workbench is an authoring tool, not a bypass around review. Generated extensions still need:

- Public-repo safety.
- Documented source/version.
- Schema validation.
- Fixtures or tests when possible.
- Human review before merge.
