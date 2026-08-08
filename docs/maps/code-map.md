# Code Map

## Root Files

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Required operating guide for coding agents. |
| `CONTRIBUTING.md` | Public contribution flow and documentation expectations. |
| `.env.example` | Public-safe template for local machine configuration. |
| `README.md` | Public project overview and local usage. |
| `LICENSE` | MIT license for public use and contribution. |
| `SECURITY.md` | Public repository safety guidance. |
| `package.json` | Node scripts and runtime metadata. |
| `.github/workflows/ci.yml` | GitHub Actions test workflow. |
| `.github/CODEOWNERS` | Default public contribution review ownership. |
| `.github/ISSUE_TEMPLATE/` | GitHub issue templates for features, adapters, and extensions. |
| `.github/pull_request_template.md` | PR checklist for validation, docs, and extension safety. |

## Source

| Path | Purpose |
| --- | --- |
| `src/engine/type-chart.js` | Type effectiveness lookup and multiplier calculation. |
| `src/engine/damage.js` | Damage range and projected switch-in damage calculations. |
| `src/engine/capture.js` | Capture chance and bag ball chance calculations. |
| `src/overlay/app.js` | Browser overlay rendering from normalized state and engine outputs. |
| `src/schemas/overlay-state.schema.json` | Public normalized state contract. |
| `src/schemas/extension.schema.json` | Public extension manifest contract. |

## Public Overlay Assets

| Path | Purpose |
| --- | --- |
| `public/index.html` | Browser overlay entry point. |
| `public/styles.css` | Overlay styles. |
| `public/sample-state.json` | Static sample state used by MVP overlay. |

## Adapters

| Path | Purpose |
| --- | --- |
| `adapters/gen3-mgba/README.md` | Notes and intended contract for first live mGBA adapter. |
| `extensions/README.md` | Extension model and rules. |
| `examples/extensions/` | Example extension manifests and README templates. |
| `examples/mapping-project/` | Sketch of future GUI-authored mapping project output. |
| `data/README.md` | Placeholder and policy for future data extensions. |
| `rulesets/README.md` | Placeholder and policy for future challenge scoring rulesets. |

## Tests And Tools

| Path | Purpose |
| --- | --- |
| `test/engine.test.js` | Node tests for type, damage, projection, and capture calculators. |
| `tools/dev-server.mjs` | Dependency-free local static server for overlay development. |

## Documentation

| Path | Purpose |
| --- | --- |
| `docs/README.md` | Documentation index. |
| `docs/project/last-worked-on.md` | Running summary of latest work and next actions. |
| `docs/project/features.md` | Feature inventory and status. |
| `docs/project/emulators.md` | Emulator compatibility matrix. |
| `docs/project/configuration.md` | Local `.env` configuration policy and variable index. |
| `docs/project/community-extensions.md` | Extension contribution and review policy. |
| `docs/project/commercial-model.md` | MIT license and future commercial services/template marketplace notes. |
| `docs/project/roadmap.md` | Phased delivery plan. |
| `docs/knowledge/architecture.md` | System architecture notes. |
| `docs/knowledge/domain-model.md` | Shared domain concepts. |
| `docs/knowledge/adapter-contracts.md` | Adapter responsibilities and contracts. |
| `docs/knowledge/extension-types.md` | Extension taxonomy and composition model. |
| `docs/knowledge/custom-data-and-fusions.md` | Guidance for custom tables, fan games, and fusion data. |
| `docs/knowledge/ui-extension-model.md` | UI panel extension slots and data flow. |
| `docs/knowledge/extension-workbench.md` | Planned GUI authoring layer for mappings and extensions. |
| `docs/knowledge/domain-extensibility.md` | Pokemon-first, domain-extensible architecture guidance. |
| `docs/knowledge/shareable-templates.md` | User-facing template bundles for sharing complete overlay setups. |
| `docs/graph/architecture.mmd` | Mermaid architecture graph. |
| `docs/decisions/` | Architecture decision records. |
