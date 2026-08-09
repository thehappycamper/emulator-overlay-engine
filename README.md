# Emulator Overlay Engine

Emulator Overlay Engine is an extensible game telemetry and interaction platform. It turns game, emulator, and external-source data into structured state and, in the future, semantic events that can power useful experiences.

Overlays are the first visible product surface, not the platform's architectural boundary. Pokemon is the first domain and proving ground.

> **EOE turns game state into events, and events into experiences.**

The larger product direction, including future automation, sessions, and optional hosted services, is documented in the [product vision](docs/knowledge/product-vision.md).

## Current Foundation

The implemented foundation is intentionally small and Pokemon-focused:

- Pokemon-owned normalized JSON state contract for party, opponent, bag, location, encounter data, seed, and scoring.
- Dependency-free, domain-neutral browser host that polls a state source and renders a useful challenge dashboard through the selected domain presentation.
- Pokemon domain package with its normalized-state contract, overlay presentation, and damage, catch, and type-effectiveness calculators plus Node tests.
- Domain-neutral mapping contract with safe calculated expressions and schema-validated examples.
- Read-only Pokemon Emerald Rev 0 source provider for mGBA 0.10.3, with strict ROM identification, a named/versioned acquisition contract, declarative mapping into validated Pokemon state, and safe local source/live-state handoffs.
- GitHub Actions CI for tests.

## Local Use

Run the overlay locally:

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:5173
```

The overlay currently polls `public/sample-state.json` (once per second by default) and re-renders only when the fetched state actually changes. The Emerald mapper can produce validated `public/live-state.json`, and the UI can select it with `?state=/public/live-state.json`. A missing, invalid, or partially-written state file is tolerated without losing the last successfully rendered content; a small status indicator reports `live`/`stale`/`error`. The polling interval can be overridden per page via `data-poll-interval-ms` on `#app`.

The Emerald mGBA provider writes an acquisition source snapshot, not overlay state. `npm run live:emerald` watches that source, applies the checked-in mapping, validates against the Pokemon schema, and atomically publishes the live-state file. See the [adapter README](adapters/gen3-mgba/README.md) for exact setup and current placeholder limitations.

## Local Configuration

For the Emerald Proof 1 workflow, copy `.env.local.example` to `.env.local`, fill in local mGBA/ROM paths, then run `npm run proof:emerald`. The launcher validates the setup, creates local snapshot directories, starts mGBA with the configured ROM, and prints the remaining manual Lua/savestate and mapper/server steps.

`.env.local` and `.env` are ignored. Never commit either file, ROMs, saves, savestates, BIOS files, or machine-specific paths. See [local configuration](docs/project/configuration.md).

## Architecture Direction

```text
Sources -> Adapters -> Safe Mapping -> Normalized State
                                      |
                                      +-> Current calculations and overlay
                                      |
                                      +-> Future semantic events
                                          -> Rules / Actions
                                          -> Overlays / Automations / Sessions
```

The current implementation does not include event detection, actions, automation, multiplayer, or hosted services.

## Roadmap

The canonical phased plan and current status live in the [project roadmap](docs/project/roadmap.md).

## Maintainer Docs

- `AGENTS.md` - required guide for coding agents.
- `CONTRIBUTING.md` - public contribution flow.
- `docs/README.md` - documentation index, project memory, architecture notes, and roadmap.
- `docs/knowledge/product-vision.md` - canonical long-term product and platform direction.
- `docs/project/community-extensions.md` - policy for reviewed community adapters, ROM-hack mappings, data packs, rulesets, and overlay panels.
- `docs/knowledge/shareable-templates.md` - template model for saving and sharing complete overlay setups.

## License And Commercial Use

This repository uses the MIT License. Commercial use is allowed.

EOE Core is intended to remain local-first and useful without a hosted account. Future paid offerings may include optional hosted services, support, and premium template packs or marketplace features, but normal repository use remains MIT-licensed.
