# Code Map

## Root Files

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Required operating guide for coding agents. |
| `CONTRIBUTING.md` | Public contribution flow and documentation expectations. |
| `.env.example` | Public-safe template for local machine configuration. |
| `.env.local.example` | Fake-path template for the local Emerald Proof 1 launcher; real `.env.local` is ignored. |
| `.env.bizhawk.local.example` | Fake-path template for the local BizHawk Proof 2 launcher; real `.env.bizhawk.local` is ignored. |
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
| `adapters/pokemon-emerald-us-rev0/` | Canonical game-owned Emerald Rev 0 acquisition package: identity, addresses, Gen III decoding, contract/schema, fixtures, mapping, validation, and shared Lua module. |
| `adapters/pokemon-emerald-us-rev0/emerald-acquisition.lua` | Provider-neutral Lua acquisition/serialization module loaded by both emulator providers. |
| `adapters/pokemon-emerald-us-rev0/emerald-us-rev0.js` | Pure/testable identity, Gen III Pokemon decoding, address, pointer, and acquisition logic. |
| `adapters/pokemon-emerald-us-rev0/emerald-source-contract.js` | Provider-neutral contract descriptor, provenance descriptors, and acquisition-to-snapshot builder. |
| `adapters/pokemon-emerald-us-rev0/emerald-state-mapping.js` | Loads/validates the single Emerald mapping, invokes `applyMappingProject()`, validates canonical Pokemon state, and writes live state. |
| `adapters/pokemon-emerald-us-rev0/schemas/emerald-us-rev0-source.schema.json` | Canonical `pokemon.emerald.us-rev0.acquisition@1.0.0` contract. |
| `adapters/pokemon-emerald-us-rev0/mappings/emerald-us-rev0-to-pokemon-overlay-state.mapping.json` | Provider-independent fixed-slot mapping into `pokemon.overlay-state@0.1.0` with documented placeholders. |
| `adapters/pokemon-emerald-us-rev0/fixtures/` | Synthetic acquisition/source fixtures; no ROM/save/game binaries. |
| `adapters/gen3-mgba/emerald-acquisition.lua` | Thin mGBA 0.10.3 provider: identity APIs, system-bus reads, lifecycle, and source publication. |
| `adapters/gen3-mgba/*.js` | Compatibility re-exports for P05 module paths that predate game-owned acquisition. |
| `adapters/bizhawk/proof-connector.lua` | Thin BizHawk 2.11.1 provider with strict identity and System Bus/direct EWRAM-IWRAM read verification. |
| `adapters/bizhawk/gba-memory-domains.js` | Pure/testable reference for BizHawk GBA System Bus-to-direct-WRAM translation and domain dimensions. |
| `adapters/{gen3-mgba,bizhawk}/extension.json` | Provider manifests exporting the shared Emerald acquisition contract. |
| `adapters/bizhawk/memory-explorer-connector.lua`, `adapters/gen3-mgba/memory-explorer-connector.lua` | Developer-only (P05-T008), read-only raw-memory diagnostic connectors, separate from the production providers; no game semantics. |
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
| `test/emerald-source-contract.test.js` | Emerald source validation, reader output, unsupported-ROM refusal, and atomic snapshot-handoff tests. |
| `test/emerald-live-state-mapping.test.js` | Mapping contract, target validation, placeholder renderer safety, fixed-slot behavior, and atomic normalized-state handoff tests. |
| `test/emerald-provider-parity.test.js` | Equivalent-provider source semantics, provider-independent downstream mapping, and mGBA compatibility import identity. |
| `test/emerald-proof-config.test.js` | Local env parsing, required path/numeric validation, output-directory setup, and mGBA child environment tests. |
| `tools/dev-server.mjs` | Dependency-free local static server for overlay development. |
| `tools/emerald-live-state.mjs` | Narrow local watcher from Emerald source snapshot through mapping/validation to `public/live-state.json`. |
| `tools/emerald-proof-config.mjs` | Pure local config parser/resolver plus Proof 1 path validation and launch-environment construction. |
| `tools/launch-emerald-proof.mjs` | Windows-friendly `npm run proof:emerald` launcher and manual workflow handoff. |
| `tools/local-env.mjs` | Non-executable parser shared by new local launcher configuration; shell expressions are treated as literal data. |
| `tools/bizhawk-proof-config.mjs` | BizHawk Proof 2 local path validation, supported identity expectations, and CLI/environment construction. |
| `tools/launch-bizhawk-proof.mjs` | Windows-friendly `npm run proof:bizhawk` launcher; auto-loads ROM, optional savestate, and Lua connector. |
| `test/bizhawk-proof-config.test.js` | BizHawk local config, fail-before-launch, CLI argument, shared-module environment, and memory-domain boundary regression tests. |
| `tools/emerald-memory-explorer-lib.mjs` | Pure hex/signed-value/diff logic for the developer-only memory explorer (P05-T008); shared by the browser UI and Node tests. |
| `tools/emerald-memory-explorer-server.mjs` | Read-only local HTTP server (no POST/PUT/DELETE route) serving the explorer UI and proxying raw-watch/source/state JSON files. |
| `tools/launch-emerald-memory-explorer.mjs` | Generates the explorer's watch list from `EMERALD_US_REV0.addresses` and launches BizHawk/mGBA with the diagnostic connector. |
| `public/emerald-memory-explorer/` | Developer-only explorer UI: raw watches, provider-neutral Emerald source, and normalized Pokemon state in three separate panels. |
| `test/emerald-memory-explorer-lib.test.js`, `test/emerald-memory-explorer-server.test.js`, `test/launch-emerald-memory-explorer.test.js` | Explorer hex/diff logic, read-only-server (including a no-mutation-surface test), and launcher/watch-generation tests. |

## Documentation

| Path | Purpose |
| --- | --- |
| `docs/README.md` | Documentation index. |
| `docs/project/last-worked-on.md` | Short pointer to current phase/active task; not the project history. |
| `docs/project/implementation-plan.md` | Engineering execution sequence: phases (`P00`, `P01`, ...) with entry/exit criteria. |
| `docs/tasks/README.md` | Task-record system: ID scheme, lifecycle, directory layout. |
| `docs/tasks/TEMPLATE.md` | Template for new task records. |
| `docs/tasks/P00/`, `docs/tasks/P01/`, `docs/tasks/P02/`, `docs/tasks/P05/`, `docs/tasks/P06/` | Per-task execution history, one file per task, grouped by phase. |
| `docs/project/branding-and-renaming.md` | Brand-agnostic coding rule, rename inventory, and future-rename procedure. |
| `docs/project/repository-boundaries.md` | Canonical public core / private hosted-services architecture boundary. |
| `docs/project/features.md` | Feature inventory and status. |
| `docs/project/emulators.md` | Emulator compatibility matrix. |
| `docs/project/configuration.md` | Local `.env.local`/`.env` policy, variable index, and Emerald Proof launcher workflow. |
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
