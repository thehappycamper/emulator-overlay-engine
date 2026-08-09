# Local Configuration

Local machine paths and private settings belong in ignored local files. The Emerald Proof 1 launcher uses `.env.local` so one checked-in template can describe the complete operator setup without committing machine-specific values.

From the repository root:

```powershell
Copy-Item .env.local.example .env.local
npm run proof:emerald -- --check
```

Replace the fake mGBA and ROM paths before running the check. The parser accepts plain or single/double-quoted values, does not expand shell expressions, and resolves relative paths from the repository root. Existing process-environment values override matching file values.

## Current Variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Local overlay dev server port. |
| `EOE_LIVE_STATE_PATH` | Validated normalized-state output path for the Emerald mapper; defaults to `public/live-state.json`. |
| `EOE_MGBA_EXE` | Required local path to the mGBA executable for `npm run proof:emerald`. |
| `EOE_EMERALD_ROM` | Required local path to a legally obtained supported Emerald ROM. The launcher passes it to mGBA but does not inspect or copy it. |
| `EOE_EMERALD_SAVESTATE` | Optional local savestate path. The launcher passes it to mGBA via the documented `--savestate` flag, so it loads automatically at startup. |
| `EOE_MGBA_SCRIPTS_DIR` | Optional local path to mGBA Lua scripts. |
| `EMERALD_SOURCE_SNAPSHOT_PATH` | Local path where the Emerald mGBA provider publishes its acquisition source snapshot. Relative values resolve from the repository root. It must be in mGBA's process environment before launch; mGBA does not load config files itself. |
| `EMERALD_MAPPING_POLL_INTERVAL_MS` | Optional positive polling interval for `npm run live:emerald`; defaults to `250`. |
| `EOE_VBA_RR_EXE` | Optional local path to VBA-RR executable. |
| `EOE_SAVE_DIR` | Optional local path to emulator save directory. |
| `EOE_DEFAULT_DOMAIN` | Optional default domain, such as `pokemon`. |
| `EOE_DEFAULT_GENERATION` | Optional default generation for domain adapter tooling. |
| `EOE_DEFAULT_GAME` | Optional default game label. |
| `EOE_DEFAULT_ROM_ID` | Optional default ROM/game code. |

## Rules

- Commit `.env.local.example`; never commit `.env.local`.
- Commit `.env.example`.
- Never commit `.env`.
- Do not put personal absolute paths in public docs, source, tests, or fixtures.
- Do not commit ROMs, BIOS files, saves, savestates, credentials, or generated snapshots/live state.
- Add Emerald Proof settings to `.env.local.example`; reserve `.env.example` for broader manual development settings.

## Emerald Proof Launcher

`npm run proof:emerald` loads `.env.local`, validates the executable/ROM/optional-savestate paths, validates both output destinations, creates their parent directories, and launches mGBA with the configured ROM. When a savestate is configured, it is passed via `mgba-qt`'s documented `--savestate` flag, so mGBA starts from it automatically. The child mGBA process inherits `EMERALD_SOURCE_SNAPSHOT_PATH` for the Lua provider. The launcher does not automate GUI clicks or script loading — mGBA has no supported command-line or config-file way to auto-load a Lua script ([mgba-emu/mgba#3289](https://github.com/mgba-emu/mgba/issues/3289), closed as not planned), so that one step remains manual.

Use `npm run proof:emerald -- --check` to validate and create directories without launching mGBA. A different local file can be selected with `--config <path>`.

Close an already-running mGBA instance before using the launcher so the process that loads the Lua script inherits the configured environment. After launch, follow the printed commands for `npm run live:emerald` and `npm start`; those processes run in separate terminals and therefore need their displayed environment assignments.
