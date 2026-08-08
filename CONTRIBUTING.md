# Contributing

Thanks for helping maintain Emulator Overlay Engine.

## Development Flow

1. Read `AGENTS.md` and `docs/README.md`.
2. Keep changes scoped.
3. Run relevant tests before committing.
4. Update documentation in the same change when behavior, architecture, feature status, emulator support, or workflow changes.
5. Prefer small commits that can land on `main` quickly.

## Checks

Run:

```powershell
npm test
```

This runs unit tests and validates all checked-in extension examples, template examples, mapping examples, and applicable normalized-state fixtures against their public schemas.

## Documentation Requirements

Update these when relevant:

- `docs/project/last-worked-on.md`
- `docs/project/implementation-plan.md` (when a task's phase gate changes)
- `docs/tasks/<PhaseID>/` (the task record for the work — see `docs/tasks/README.md`)
- `docs/project/features.md`
- `docs/project/emulators.md`
- `docs/project/roadmap.md`
- `docs/maps/code-map.md`
- `docs/decisions/`

Non-trivial changes should reference a task ID (e.g. `P01-T004`). Routine implementation work does not require a new ADR; ADRs remain for architectural/public-contract decisions.

## Adapter Contributions

Adapter changes should document:

- Emulator and version.
- Game, generation, and ROM revision or hack version.
- What data is exported.
- Known limitations.
- How to run or load the adapter.

Do not commit ROMs, BIOS files, copyrighted game assets, save files, or secrets.

## Community Extensions

Public contributions are welcome for adapters, ROM-hack mappings, data packs, calculators, rulesets, overlay panels, and shareable templates.

Extensions and templates must be reviewed before merge. Good PRs include:

- Supported emulator/game/hack version.
- Data source notes.
- Sample fixtures when possible.
- Tests for mapping or calculation behavior when practical.
- Documentation updates.

See `docs/project/community-extensions.md`.
