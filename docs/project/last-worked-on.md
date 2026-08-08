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

Why:

- The project is intended to become public and will likely be maintained across multiple coding sessions and agents.
- The repo needs a reliable way to answer what changed last, why it changed, and where future work should happen.
- Public contributions should be welcomed for adapters, ROM-hack support, data packs, and rulesets, while keeping review and public-repo safety explicit.

Next Actions:

- Configure a GitHub remote once the repository exists online.
- Implement live Gen 3 mGBA JSON export.
- Decide whether the overlay should poll `public/live-state.json`, use WebSocket state, or support both.
