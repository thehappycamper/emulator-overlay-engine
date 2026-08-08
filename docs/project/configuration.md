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
| `POE_LIVE_STATE_PATH` | Future live adapter output path. |
| `POE_MGBA_EXE` | Optional local path to mGBA executable. |
| `POE_MGBA_SCRIPTS_DIR` | Optional local path to mGBA Lua scripts. |
| `POE_VBA_RR_EXE` | Optional local path to VBA-RR executable. |
| `POE_SAVE_DIR` | Optional local path to emulator save directory. |
| `POE_DEFAULT_GENERATION` | Optional default generation for adapter tooling. |
| `POE_DEFAULT_GAME` | Optional default game label. |
| `POE_DEFAULT_ROM_ID` | Optional default ROM/game code. |

## Rules

- Commit `.env.example`.
- Never commit `.env`.
- Do not put personal absolute paths in public docs, source, tests, or fixtures.
- If a new local setting is required, add it to `.env.example` and document it here.
