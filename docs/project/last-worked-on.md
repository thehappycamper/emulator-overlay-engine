# Last Worked On

## 2026-08-08 - Repository Documentation Scaffold

Goal:

- Make the repository navigable for humans and coding agents.
- Add public-safe agent instructions, code maps, knowledge base docs, architecture graph, feature tracking, emulator compatibility, and decision records.

Changes:

- Added `AGENTS.md` with required agent behavior, documentation expectations, branch policy, CI expectations, and architecture rules.
- Added project documentation index under `docs/`.
- Added knowledge base and project tracking documents.
- Added Mermaid architecture graph.
- Added initial ADRs for the normalized API and documentation governance.
- Added community extension policy, CODEOWNERS, extension templates, and placeholder `data/` and `rulesets/` directories.
- Scrubbed local absolute paths from public-facing adapter docs before GitHub push.
- Added `.env.example` and configuration docs so local paths stay out of the public repository.
- Clarified that emulator integrations are extensions and added example extension manifests/templates.
- Added extension manifest schema and examples for emulator, game, data, mechanics, ruleset, analysis, overlay panel, and transport extension types.
- Added custom data/fusion guidance, a fusion data extension example, and optional normalized Pokemon fields for display/component/source ID metadata.
- Added flexible UI extension model with panel slots and namespaced extension runtime state.
- Added Extension Workbench architecture notes, ADR, roadmap phase, and example mapping project output.
- Recorded Pokemon-first, domain-extensible direction for future non-Pokemon support.
- Superseded that direction with a domain-neutral platform decision where Pokemon becomes the first domain package.
- Added shareable templates as the user-facing bundle format for public reuse.
- Added calculator extension type and example for battle calculations, catch odds, stat projection, and learnset availability.

Why:

- The project is intended to become public and will likely be maintained across multiple coding sessions and agents.
- The repo needs a reliable way to answer what changed last, why it changed, and where future work should happen.
- Public contributions should be welcomed for adapters, ROM-hack support, data packs, and rulesets, while keeping review and public-repo safety explicit.

Next Actions:

- Push `main` to GitHub now that the public repository exists.
- Implement live Gen 3 mGBA JSON export.
- Decide whether the overlay should poll `public/live-state.json`, use WebSocket state, or support both.
