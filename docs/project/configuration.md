# Local Configuration

Local machine paths and private settings belong in ignored local files. Emerald Proof 1 uses `.env.local`; BizHawk Proof 2 uses `.env.bizhawk.local`. Their checked-in templates describe operator setup without committing machine-specific values.

From the repository root:

```powershell
Copy-Item .env.local.example .env.local
npm run proof:emerald -- --check
```

Replace the fake mGBA and ROM paths before running the check. The parser accepts plain or single/double-quoted values, does not expand shell expressions, and resolves relative paths from the repository root. Existing process-environment values override matching file values.

For BizHawk:

```powershell
Copy-Item .env.bizhawk.local.example .env.bizhawk.local
npm run proof:bizhawk -- --check
```

## Current Variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Local overlay dev server port. |
| `EOE_LIVE_STATE_PATH` | Validated normalized-state output path for the Emerald mapper; defaults to `public/live-state.json`. |
| `EOE_MGBA_EXE` | Required local path to the mGBA executable for `npm run proof:emerald`. |
| `EOE_EMERALD_ROM` | Required local path to a legally obtained supported Emerald ROM. The launcher passes it to mGBA but does not inspect or copy it. |
| `EOE_EMERALD_SAVESTATE` | Optional local savestate path. The launcher passes it to mGBA via the documented `--savestate` flag, so it loads automatically at startup. |
| `EOE_MGBA_SCRIPTS_DIR` | Optional local path to mGBA Lua scripts. |
| `EOE_BIZHAWK_EXE` | Required local path to BizHawk 2.11.1 `EmuHawk.exe` for `npm run proof:bizhawk`. |
| `EOE_BIZHAWK_EMERALD_ROM` | Required local path to a legally obtained Emerald English retail Rev 0 image for Proof 2. |
| `EOE_BIZHAWK_EMERALD_SAVESTATE` | Optional local BizHawk savestate; passed through `--load-state`. |
| `EMERALD_SOURCE_SNAPSHOT_PATH` | Local path where either supported Emerald provider publishes its acquisition source snapshot. Relative values resolve from the repository root. It must be inherited by the emulator process. |
| `EMERALD_ACQUISITION_MODULE_PATH` | Launcher-managed path to the checked-in shared Emerald Lua module. Users normally do not set this directly. |
| `EMERALD_MAPPING_POLL_INTERVAL_MS` | Optional positive polling interval for `npm run live:emerald`; defaults to `250`. |
| `EOE_VBA_RR_EXE` | Optional local path to VBA-RR executable. |
| `EOE_SAVE_DIR` | Optional local path to emulator save directory. |
| `EOE_DEFAULT_DOMAIN` | Optional default domain, such as `pokemon`. |
| `EOE_DEFAULT_GENERATION` | Optional default generation for domain adapter tooling. |
| `EOE_DEFAULT_GAME` | Optional default game label. |
| `EOE_DEFAULT_ROM_ID` | Optional default ROM/game code. |

## Rules

- Commit `.env.local.example`; never commit `.env.local`.
- Commit `.env.bizhawk.local.example`; never commit `.env.bizhawk.local`.
- Commit `.env.example`.
- Never commit `.env`.
- Do not put personal absolute paths in public docs, source, tests, or fixtures.
- Do not commit ROMs, BIOS files, saves, savestates, credentials, or generated snapshots/live state.
- Add Emerald Proof settings to `.env.local.example`; reserve `.env.example` for broader manual development settings.

## Emerald Proof Launcher

`npm run proof:emerald` loads `.env.local`, validates the executable/ROM/optional-savestate paths, shared acquisition module, and both output destinations, creates their parent directories, and launches mGBA with the configured ROM. When a savestate is configured, it is passed via `mgba-qt`'s documented `--savestate` flag, so mGBA starts from it automatically. The child mGBA process inherits both source-snapshot and shared-module paths. The launcher does not automate GUI clicks or script loading — mGBA has no supported command-line or config-file way to auto-load a Lua script ([mgba-emu/mgba#3289](https://github.com/mgba-emu/mgba/issues/3289), closed as not planned), so that one step remains manual.

Use `npm run proof:emerald -- --check` to validate and create directories without launching mGBA. A different local file can be selected with `--config <path>`.

Close an already-running mGBA instance before using the launcher so the process that loads the Lua script inherits the configured environment. After launch, follow the printed commands for `npm run live:emerald` and `npm start`; those processes run in separate terminals and therefore need their displayed environment assignments.

## BizHawk Proof Launcher

`npm run proof:bizhawk` loads `.env.bizhawk.local`, validates the executable, ROM, optional savestate, shared acquisition module, connector, source destination, and live-state destination, then launches BizHawk with `--lua=<connector>`, optional `--load-state=<savestate>`, and the ROM as the final argument. BizHawk 2.11.1 loads the ROM/state before starting Lua. The provider verifies BizHawk version `2.11.1`, system `GBA`, the supported Emerald Rev 0 SHA-1, expected GBA memory domains/sizes, and System Bus/direct WRAM read parity before publishing the shared source contract.

Use `npm run proof:bizhawk -- --check` to validate and create output directories without launching BizHawk. The launcher prints the exact `npm run live:emerald` and `npm start` handoff commands; the real-ROM acceptance observations remain unrecorded.

`npm run proof:emerald:bizhawk` (see `docs/tasks/P05/P05-T012.md`) reuses this exact launcher/config logic to run BizHawk, the mapper, and the server as one coordinated session in a single terminal, instead of manually running the three commands above in three terminals. The commands above remain available individually for diagnostics.
