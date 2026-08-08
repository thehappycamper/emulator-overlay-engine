# Emulator Overlay Engine

Emulator Overlay Engine is an extensible game telemetry and interaction platform. It turns game, emulator, and external-source data into structured state and, in the future, semantic events that can power useful experiences.

Overlays are the first visible product surface, not the platform's architectural boundary. Pokemon is the first domain and proving ground.

> **EOE turns game state into events, and events into experiences.**

The larger product direction, including future automation, sessions, and optional hosted services, is documented in the [product vision](docs/knowledge/product-vision.md).

## Current Foundation

The implemented foundation is intentionally small and Pokemon-focused:

- Pokemon-owned normalized JSON state contract for party, opponent, bag, location, encounter data, seed, and scoring.
- Dependency-free browser overlay that renders a useful challenge dashboard from that state.
- Pokemon domain package with damage, catch, and type-effectiveness calculators plus Node tests.
- Domain-neutral mapping contract with safe calculated expressions and schema-validated examples.
- Gen 3 mGBA adapter notes describing how live Lua export should reach normalized state, via the mapping runtime or as a documented direct-export exception.
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

The overlay currently reads `public/sample-state.json`. A live emulator adapter can later reach `public/live-state.json` with normalized state (via the mapping runtime, or a documented direct-export exception — see `docs/knowledge/adapter-contracts.md`), and the UI can be switched to that feed.

## Local Configuration

Copy `.env.example` to `.env` for machine-specific paths such as emulator executables, script directories, save folders, and future live state output paths.

Do not commit `.env`.

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
