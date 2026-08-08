# Last Worked On

## 2026-08-08 - Safe Mapping Contract Vertical Slice

Goal:

- Implement the first executable platform-level mapping contract for the future Extension Workbench.
- Keep mappings domain-neutral and calculated fields non-executable.

Changes:

- Added `src/schemas/mapping.schema.json` for versioned projects, named/versioned source and target contracts, direct mappings, ID/value mappings, calculated fields, and validation metadata.
- Added a pure, whitelisted JSON expression evaluator with no `eval`, `Function`, imports, method calls, or host-global access.
- Added an executable mapping pipeline with deterministic ordering, required-path checks, and a caller-provided target validation hook.
- Converted the fusion mapping example from JavaScript-like strings to the safe AST.
- Added Ajv as a development-only dependency for complete Draft 2020-12 validation rather than maintaining a partial validator.
- Added automated validation for every extension example, template example, applicable normalized-state fixture, and the mapping example.
- Reused the extension type enum from the template schema and documented deferred template embedding.
- Added ROM, BIOS, save, and savestate `.gitignore` backstops.
- Recorded the mapping security and extensibility decision in ADR 0012.

Why:

- Workbench-authored mappings must be portable and reviewable without turning public data files into executable code.
- Named contract descriptors let future mappings target state, events, or other payload categories without introducing those systems now.
- Public examples need continuous schema validation so contract drift is detected in CI.

Next Actions:

- Implement live Gen 3 mGBA JSON export.
- Decide whether the overlay should poll `public/live-state.json`, use WebSocket state, or support both.
- Design the Workbench GUI only after source exploration and authoring requirements are concrete.
- Decide how a future contract registry resolves `target.schema` before runtime-installed mappings are supported.
- Rename the local folder to `emulator-overlay-engine` when convenient. The GitHub repository and remote URL now use `emulator-overlay-engine`.
