# Local Configuration

Local machine paths and private settings belong in `.env`.

Start by copying:

```powershell
Copy-Item .env.example .env
```

Then fill in only the values needed for your machine.

## Current Variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Local overlay dev server port. |
| `EOE_LIVE_STATE_PATH` | Validated normalized-state output path for the Emerald mapper; defaults to `public/live-state.json`. |
| `EOE_MGBA_EXE` | Optional local path to mGBA executable. |
| `EOE_MGBA_SCRIPTS_DIR` | Optional local path to mGBA Lua scripts. |
| `EMERALD_SOURCE_SNAPSHOT_PATH` | Absolute local path where the Emerald mGBA provider publishes its acquisition source snapshot. Must be in mGBA's process environment before launch; mGBA does not load `.env` itself. |
| `EMERALD_MAPPING_POLL_INTERVAL_MS` | Optional positive polling interval for `npm run live:emerald`; defaults to `250`. |
| `EOE_VBA_RR_EXE` | Optional local path to VBA-RR executable. |
| `EOE_SAVE_DIR` | Optional local path to emulator save directory. |
| `EOE_DEFAULT_DOMAIN` | Optional default domain, such as `pokemon`. |
| `EOE_DEFAULT_GENERATION` | Optional default generation for domain adapter tooling. |
| `EOE_DEFAULT_GAME` | Optional default game label. |
| `EOE_DEFAULT_ROM_ID` | Optional default ROM/game code. |

## Rules

- Commit `.env.example`.
- Never commit `.env`.
- Do not put personal absolute paths in public docs, source, tests, or fixtures.
- If a new local setting is required, add it to `.env.example` and document it here.
