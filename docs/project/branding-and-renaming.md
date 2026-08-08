# Branding And Renaming

## Status

The current temporary product name is **Emulator Overlay Engine** (short form: **EOE**). Repository slug: `emulator-overlay-engine`.

**The final brand is intentionally undecided.** Do not treat "Emulator Overlay Engine" or "EOE" as a permanent identity. This document exists so a future rename is a bounded, inventoried exercise instead of an archaeology project.

## Principle

> Product branding is presentation and distribution metadata, not a semantic platform concept.

A brand name is what the product is called. It is not an architectural boundary, a data contract, or a reason a concept exists. The platform's real concepts already have neutral names, and code/docs should keep using those neutral names instead of the brand:

- source
- provider
- adapter
- contract
- mapping
- state
- event
- rule
- action
- session
- domain
- extension
- template
- view

## Naming rule for new work

When introducing a new identifier, ask whether the brand name is load-bearing. It almost never is.

- Prefer `pokemon.badge_earned` over `eoe.pokemon.badge_earned`, unless a later namespace decision explicitly requires a vendor prefix (for example, to avoid collisions in a public extension registry).
- Prefer neutral architectural terms ("the platform core," "the local runtime," "a hosted service") in new architecture prose over coining brand-specific sub-names for internal concepts.
- It is fine for **display text** (page titles, CLI banners, marketing copy, issue-template prose) to say "Emulator Overlay Engine." That text is expected to change at rename time and changing it is cheap.
- It is not fine for a **schema `$id`, namespace, environment variable prefix, or extension/template identifier convention** to silently assume the brand will never change. Those are contracts other files and other people's data depend on — see the compatibility-sensitive list below.

This rule is added to `AGENTS.md` so it applies to all future agent and human contributions, not just this document.

## Rename inventory

Every current brand occurrence, classified. Found via a repository-wide search for `Emulator Overlay Engine`, `EOE`, `EOE_`, and `emulator-overlay-engine` (excluding `node_modules`, `.git`, and historical ADRs, which are handled separately below).

### Category 1 — Display branding (safe to rename later, low friction)

Cosmetic text. Changing it has no effect on behavior, validation, or any other file's ability to resolve a reference.

| Location | Occurrence |
| --- | --- |
| `README.md` | Title, tagline, prose (`Emulator Overlay Engine`, `EOE`) |
| `public/index.html:6` | `<title>Emulator Overlay Engine</title>` |
| `tools/dev-server.mjs:39` | Startup console log: `Emulator Overlay Engine running at ...` |
| `.github/ISSUE_TEMPLATE/feature_request.md:3` | `about: Propose an Emulator Overlay Engine feature` |
| `src/schemas/*.schema.json` `"title"` fields | `"Emulator Overlay Engine Extension/Template/Mapping Manifest"`, `"Pokemon Overlay State"` — descriptive JSON Schema metadata, not used for schema resolution (`$id` is, see Category 3) |
| `AGENTS.md`, `docs/knowledge/*.md`, `docs/project/*.md` prose | Narrative uses of "EOE," "EOE Core," "EOE Cloud" as shorthand for the platform/local runtime/hosted tier |
| `docs/graph/architecture.mmd` | `"EOE Cloud\nOptional Future Consumer"` node label |

**Note on "EOE Core" / "EOE Cloud":** these are used throughout `docs/knowledge/product-vision.md` and related docs as convenient names for two real, worth-keeping distinctions — the local/open-source runtime versus an optional hosted tier. The *distinction* should survive a rename; the *names* ("EOE Core," "EOE Cloud") are brand-derived and will need to change together with the primary brand. Prefer neutral phrasing ("the local runtime," "an optional hosted service") in newly written architecture prose going forward; existing prose does not need an immediate sweep.

### Category 2 — Distribution/repository identity

Identifies the project to package managers, hosting, and tooling. Renaming has real but well-understood mechanics (a repo rename, a package rename) and does not require a compatibility/migration story for third-party data.

| Location | Occurrence |
| --- | --- |
| `package.json:2` | `"name": "emulator-overlay-engine"` (currently `"private": true`, so no published npm identity is at stake yet) |
| GitHub repository | `thehappycamper/emulator-overlay-engine` (see ADR 0011) |
| Local working-directory folder name | Not repository content; independent of this document |

### Category 3 — Public contract identifiers (compatibility-sensitive — do not rename casually)

These are identifiers other files, other tools, or a user's local machine may already depend on. Changing one is a breaking change for anything that references the old value, and needs a migration story, not a find-and-replace.

| Location | Occurrence | Why it's sensitive |
| --- | --- | --- |
| `src/schemas/extension.schema.json:3` | `"$id": "https://emulator-overlay-engine.local/schemas/extension.schema.json"` | Canonical schema identity. `template.schema.json` resolves a cross-schema `$ref` against this exact URI (`src/schemas/template.schema.json:52`). Changing it without updating every referrer breaks schema resolution. |
| `src/schemas/template.schema.json:3` | Same pattern | Same reason |
| `src/schemas/mapping.schema.json:3` | Same pattern | Same reason |
| `src/domains/pokemon/schemas/overlay-state.schema.json:3` | `"$id": "https://emulator-overlay-engine.local/schemas/overlay-state.schema.json"` | Canonical Pokemon state-contract identity, preserved from its former physical location. The compatibility file at `src/schemas/overlay-state.schema.json` has no independent `$id` and delegates to this URI. |
| `.env.example`, `docs/project/configuration.md` | `EOE_LIVE_STATE_PATH`, `EOE_MGBA_EXE`, `EOE_MGBA_SCRIPTS_DIR`, `EOE_VBA_RR_EXE`, `EOE_SAVE_DIR`, `EOE_DEFAULT_DOMAIN`, `EOE_DEFAULT_GENERATION`, `EOE_DEFAULT_GAME`, `EOE_DEFAULT_ROM_ID` | Environment variable prefix. Anyone who has already copied `.env.example` to `.env` locally has these exact names in a file `.gitignore` keeps out of the repository, so the repository itself can't detect or migrate their copy. |
| `package.json:2` (also listed under Category 2) | `"name"` | If this package is ever published (currently `"private": true`), consumers would depend on the published name. |

**Rule:** none of the above should be renamed as a side effect of a display-branding pass. A real rename touches these deliberately, with the migration plan below.

### Category 4 — Historical record (do not rewrite)

ADRs and past commit messages document decisions made under the current name, including the decision to adopt it:

- `docs/decisions/0011-rename-to-emulator-overlay-engine.md` — records the Pokemon-Overlay-Engine → Emulator-Overlay-Engine rename itself.
- All other ADRs (`docs/decisions/0001` through `0013` as of this writing) that mention the product name in context.
- Git commit history (e.g. `ccc9642 Initialize Pokemon overlay engine MVP`, `fe435dc Align docs and naming with emulator overlay engine`).

A future rename should add a new ADR recording the new decision. It should not edit old ADRs to retroactively change what name they say — that would falsify the record of what the project was called when that decision was made. `docs/tasks/` task records are the same: once completed, a task record is history and should not be retroactively rebranded either (see `docs/tasks/README.md`).

### Category 5 — Unnecessary semantic coupling (remove where safe)

This is the category that would actually need code changes: a brand name embedded where a neutral term should be doing the work.

**Audit result: none found requiring a fix.** Every semantic identifier already in the repository was checked against this category:

- Event/action examples in `docs/knowledge/product-vision.md` already use unprefixed, domain-scoped names (`pokemon.badge_earned`, `pokemon.gym_leader_defeated`, `overlay.show`, `audio.play`, `obs.trigger`, `http.webhook`, `mqtt.publish`) — no `eoe.` prefix anywhere.
- Extension and template example IDs (`example.emulator`, `example.data`, `example.pokemon-emerald-challenge`, `example.fusion-species-mapping`, etc. under `examples/`) are brand-neutral.
- The extension/template/mapping schema `$defs` (operator names, slot names, extension types) use neutral vocabulary (`emulator`, `game`, `data`, `mechanics`, `calculator`, `ruleset`, `analysis`, `overlay-panel`, `transport`; expression ops like `field`, `literal`, `compact`) with no brand coupling.
- `src/expressions/evaluate.js` and `src/mapping/apply.js` contain no brand-specific naming at all.

If a future contribution introduces a brand-prefixed identifier where a neutral one would do (for example `eoe.mapping.schemaVersion` instead of just versioning the mapping schema itself), that is Category 5 and should be caught in review under the rule in `AGENTS.md`.

## Expected rename procedure

When a final brand is chosen, work through this checklist. Items are grouped by how much care they need; within a group, order doesn't matter much.

**Trivial (find-and-replace, Category 1):**
- [ ] README display text and tagline
- [ ] `public/index.html` page title
- [ ] `tools/dev-server.mjs` startup log line
- [ ] GitHub issue/PR templates (`.github/ISSUE_TEMPLATE/*.md`, `.github/pull_request_template.md`)
- [ ] JSON Schema `"title"` fields (not `$id` — see below)
- [ ] Docs prose ("EOE," "EOE Core," "EOE Cloud" narrative mentions)
- [ ] `docs/graph/architecture.mmd` node labels
- [ ] Badges/links in README, if added later

**Needs a deliberate decision, not just a text swap (Category 2/3):**
- [ ] GitHub repository name/organization (redirects exist after a GitHub rename, but update the remote and any hardcoded URLs anyway)
- [ ] `package.json` `"name"` (and npm registry publish, if this package is ever made public)
- [ ] Schema `$id` values in `src/schemas/*.json` and domain-owned schemas — update every compatibility/cross-schema `$ref` in the same commit, including the Pokemon state path alias, or schema resolution breaks
- [ ] Environment variable prefix (`EOE_*`) — requires a migration note in `docs/project/configuration.md` and probably a deprecation window (support both old and new variable names for one release) rather than a hard cutover, since `.env` files are never in the repository and can't be auto-migrated
- [ ] SDK/package names, if any packages are ever published (none exist today — do not invent this ahead of need)
- [ ] CLI name, if a CLI is ever introduced (none exists today)
- [ ] Hosted domain(s)/API host(s), if any are ever stood up (none exist today — "EOE Cloud" is a product-vision placeholder, not infrastructure)
- [ ] Extension/template registry namespace conventions, if a registry is ever built (none exists today)
- [ ] npm or other package-registry organization/scope, if used
- [ ] CI/deployment configuration referencing the old name (currently `.github/workflows/ci.yml` has none — it doesn't reference the product name)
- [ ] Documentation cross-links that embed the old repository slug in a URL (audit `docs/**/*.md` for `github.com/.../emulator-overlay-engine` style links before assuming a GitHub rename's redirect covers everything)

**Leave alone (Category 4):**
- [ ] Do not edit existing ADR text to change historical name references
- [ ] Do not edit completed `docs/tasks/**` records to change historical name references
- [ ] Do not rewrite git commit messages

**After the sweep:**
- [ ] Add a new ADR recording the rename decision and date (follow the pattern of ADR 0011)
- [ ] Update `docs/project/last-worked-on.md` and the relevant `docs/tasks/` record
- [ ] Grep the whole repository for the old name/prefix one more time as a final check — this document's inventory is a snapshot as of this writing, not a guarantee that no new coupling was introduced since

## Do not invent infrastructure

This document intentionally does not list steps for hosted domains, SDKs, a CLI, or a package registry as if they exist — none of them do yet. They're included in the checklist above only as placeholders to fill in *if and when* they're built, so the rename procedure doesn't need to be rewritten from scratch at that point.
