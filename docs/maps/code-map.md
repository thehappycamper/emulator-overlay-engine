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
| `package-lock.json` | Reproducible development dependency versions. |
| `.github/workflows/ci.yml` | GitHub Actions test workflow. |
| `.github/CODEOWNERS` | Default public contribution review ownership. |
| `.github/ISSUE_TEMPLATE/` | GitHub issue templates for features, adapters, extensions, and templates. |
| `.github/pull_request_template.md` | PR checklist for validation, docs, and extension safety. |

## Source

| Path | Purpose |
| --- | --- |
| `src/platform/domain-registry.js` | Domain-neutral immutable registry for explicitly composed domain packages. |
| `src/domains/index.js` | Application composition root that registers the currently supported domains. |
| `src/domains/pokemon/index.js` | Pokemon domain descriptor, named state-contract metadata, calculator surface, and presentation capability. |
| `src/domains/pokemon/type-chart.js` | Pokemon type effectiveness lookup and multiplier calculation. |
| `src/domains/pokemon/damage.js` | Pokemon damage range and projected switch-in damage calculations. |
| `src/domains/pokemon/capture.js` | Pokemon capture chance and bag ball chance calculations. |
| `src/domains/pokemon/presentation.js` | Pokemon-owned static overlay rendering and calculator-backed presentation projections. |
| `src/domains/pokemon/presentation.css` | Pokemon-owned overlay layout and component styles. |
| `src/domains/pokemon/schemas/overlay-state.schema.json` | Canonical Pokemon normalized-state contract. |
| `src/engine/*.js` | Compatibility re-exports for calculator imports that predate the domain package. |
| `src/expressions/evaluate.js` | Pure evaluator for the whitelisted JSON expression AST. |
| `src/mapping/apply.js` | Executes direct, value, and calculated mappings into a new target value. |
| `src/overlay/host.js` | Domain-neutral validation and dispatch for a selected domain overlay presentation. |
| `src/overlay/app.js` | Domain-neutral browser bootstrap: state URL/domain resolution, stylesheets, live-status display, and presentation dispatch. |
| `src/overlay/live-state.js` | Domain-neutral, dependency-injectable polling controller: no-overlap fetch scheduling, change-only rendering, live/stale/error status. |
| `src/schemas/overlay-state.schema.json` | Compatibility `$ref` from the former platform path to the Pokemon-owned state contract. |
| `src/schemas/extension.schema.json` | Public extension manifest contract. |
| `src/schemas/template.schema.json` | Public template manifest contract. |
| `src/schemas/mapping.schema.json` | Domain-neutral mapping-project and expression AST contract. |

## Public Overlay Assets

| Path | Purpose |
| --- | --- |
| `public/index.html` | Browser overlay entry point. |
| `public/styles.css` | Domain-neutral overlay shell variables, reset, and error styles. |
| `public/sample-state.json` | Static sample state used by MVP overlay. |

## Adapters

| Path | Purpose |
| --- | --- |
| `adapters/gen3-mgba/README.md` | Supported fingerprint, mGBA setup, manual smoke procedure, sources, and limitations for the first live acquisition proof. |
| `adapters/gen3-mgba/emerald-acquisition.lua` | Read-only mGBA 0.10.3 Lua provider for strict-fingerprint Emerald Rev 0 diagnostics. |
| `adapters/gen3-mgba/emerald-us-rev0.js` | Pure/testable identity, Gen III Pokemon decoding, address, pointer, and diagnostic reference logic. |
| `adapters/gen3-mgba/extension.json` | Public extension manifest for the acquisition proof. |
| `adapters/gen3-mgba/fixtures/` | Synthetic derived acquisition fixtures; no ROM/save/game binaries. |
| `extensions/README.md` | Extension model and rules. |
| `examples/extensions/` | Example extension manifests and README templates. |
| `examples/templates/` | Example shareable template manifests and README files. |
| `examples/mapping-project/` | Executable, schema-validated fusion mapping example. |
| `templates/README.md` | Location and rules for reviewed shareable templates. |
| `data/README.md` | Placeholder and policy for future data extensions. |
| `rulesets/README.md` | Placeholder and policy for future challenge scoring rulesets. |

## Tests And Tools

| Path | Purpose |
| --- | --- |
| `test/engine.test.js` | Node tests for type, damage, projection, and capture calculators. |
| `test/domain-boundary.test.js` | Pokemon package resolution, behavior, unknown-domain, and compatibility tests. |
| `test/presentation-boundary.test.js` | Generic presentation dispatch and Pokemon static-rendering regression coverage. |
| `test/platform-domain-registry.test.js` | Platform-only proof that no domain implementation is registered implicitly. |
| `test/expressions.test.js` | Safe expression behavior and negative security tests. |
| `test/mapping.test.js` | Mapping pipeline and fusion example execution tests. |
| `test/schema-validation.test.js` | Automated validation of public manifests, mappings, canonical Pokemon state fixtures, and the legacy state-schema alias. |
| `test/live-state.test.js` | Live-state polling controller: render-on-change, no-overlap fetches, transient-failure/recovery, and status transitions. |
| `test/mgba-emerald-acquisition.test.js` | Emerald fingerprint, Gen III encrypted-species/stat decoding, battle/location acquisition, pointer safety, and Lua-layout synchronization tests. |
| `tools/dev-server.mjs` | Dependency-free local static server for overlay development. |

## Documentation

| Path | Purpose |
| --- | --- |
| `docs/README.md` | Documentation index. |
| `docs/project/last-worked-on.md` | Short pointer to current phase/active task; not the project history. |
| `docs/project/implementation-plan.md` | Engineering execution sequence: phases (`P00`, `P01`, ...) with entry/exit criteria. |
| `docs/tasks/README.md` | Task-record system: ID scheme, lifecycle, directory layout. |
| `docs/tasks/TEMPLATE.md` | Template for new task records. |
| `docs/tasks/P00/`, `docs/tasks/P01/`, `docs/tasks/P02/`, `docs/tasks/P05/` | Per-task execution history, one file per task, grouped by phase. |
| `docs/project/branding-and-renaming.md` | Brand-agnostic coding rule, rename inventory, and future-rename procedure. |
| `docs/project/repository-boundaries.md` | Canonical public core / private hosted-services architecture boundary. |
| `docs/project/features.md` | Feature inventory and status. |
| `docs/project/emulators.md` | Emulator compatibility matrix. |
| `docs/project/configuration.md` | Local `.env` configuration policy and variable index. |
| `docs/project/community-extensions.md` | Extension contribution and review policy. |
| `docs/project/commercial-model.md` | MIT license and future commercial services/template marketplace notes. |
| `docs/project/roadmap.md` | Phased delivery plan. |
| `docs/knowledge/product-vision.md` | Canonical product definition, pipeline, and local/hosted boundary. |
| `docs/knowledge/architecture.md` | Current telemetry layers and future event-driven architecture. |
| `docs/knowledge/domain-model.md` | Shared domain concepts. |
| `docs/knowledge/adapter-contracts.md` | Source-provider/adapter responsibilities and acquisition-independent boundaries. |
| `docs/knowledge/extension-types.md` | Extension taxonomy and composition model. |
| `docs/knowledge/custom-data-and-fusions.md` | Guidance for custom tables, fan games, and fusion data. |
| `docs/knowledge/ui-extension-model.md` | UI panel extension slots and data flow. |
| `docs/knowledge/extension-workbench.md` | Planned visual authoring for mappings and future event/rule/action contracts. |
| `docs/knowledge/domain-extensibility.md` | Domain-neutral platform and domain package guidance. |
| `docs/knowledge/shareable-templates.md` | User-facing template bundles for sharing complete overlay setups. |
| `docs/graph/architecture.mmd` | Mermaid architecture graph. |
| `docs/decisions/` | Architecture decision records. |
