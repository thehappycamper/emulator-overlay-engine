# Contributing

Thanks for helping maintain Pokemon Overlay Engine.

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

## Documentation Requirements

Update these when relevant:

- `docs/project/last-worked-on.md`
- `docs/project/features.md`
- `docs/project/emulators.md`
- `docs/project/roadmap.md`
- `docs/maps/code-map.md`
- `docs/decisions/`

## Adapter Contributions

Adapter changes should document:

- Emulator and version.
- Game, generation, and ROM revision or hack version.
- What data is exported.
- Known limitations.
- How to run or load the adapter.

Do not commit ROMs, BIOS files, copyrighted game assets, save files, or secrets.

## Community Extensions

Public contributions are welcome for adapters, ROM-hack mappings, data packs, rulesets, and overlay panels.

Extensions must be reviewed before merge. Good extension PRs include:

- Supported emulator/game/hack version.
- Data source notes.
- Sample fixtures when possible.
- Tests for mapping or calculation behavior when practical.
- Documentation updates.

See `docs/project/community-extensions.md`.
