# Shareable Templates

Templates are the user-facing package format for sharing overlay support.

A module/extension is a technical unit. A template is a shareable bundle that can include multiple modules/extensions, mappings, calculated fields, fixtures, and UI layout preferences.

## Example Template Contents

```text
template.json
README.md
extensions/
  emulator/
  game/
  data/
  mechanics/
  overlay-panels/
mappings/
fixtures/
```

Template manifests should follow `src/schemas/template.schema.json`.

## Current Manifest Boundary

The current template schema validates template identity, compatibility, selected module types, UI panel preferences, and public-safety declarations. Module types reuse the extension manifest's canonical extension-type definition.

Full embedding or file references for mapping projects, calculated fields, and fixtures are intentionally deferred. Templates can be organized with those files at the package level, but the manifest does not yet describe or validate them. That broader manifest design should follow real Workbench export requirements instead of being guessed in this mapping-foundation slice.

Mapping projects have their own executable contract in `src/schemas/mapping.schema.json`. A future template-schema revision can reference versioned mapping projects without copying their expression model.

## What Templates Enable

- A user maps a game once and exports a template.
- Other users install or copy that template.
- The overlay can expose the same mapped data and UI panels for everyone.
- Public contributors can review template files through GitHub.

## Template Examples

Pokemon Emerald challenge template:

```text
emulator: mGBA
game mapping: Pokemon Emerald US
data: Gen 3 vanilla data
mechanics: Gen 3 Pokemon mechanics
panels: party, battle, route, capture, score
```

Fusion game template:

```text
emulator: mGBA or supported runtime
game mapping: custom fusion game memory/state
data: fusion species and learnsets
mechanics: fusion stat/type formulas
panels: fusion inspector, party, battle, route
```

Non-Pokemon game template:

```text
emulator/runtime: supported source
domain: custom game domain
data: game-specific entities and rules
panels: domain-specific views
```

## Review Rules

Templates must follow public repository safety:

- No ROMs.
- No BIOS files.
- No copyrighted game assets.
- No personal saves.
- No secrets.
- No local absolute paths.

Templates should document supported game versions and data sources.

## Relationship To Modules

Modules/extensions expose or calculate data. Mapping projects declaratively transform data between named contracts. Templates select the modules and UI preferences that make the complete setup reusable.
