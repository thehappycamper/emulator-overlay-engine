# Pokemon Overlay Engine

Generation-agnostic overlay engine for Pokemon emulator tooling.

The project keeps ROM and emulator details at the edges. Adapters read live data from an emulator or save source, normalize it into the shared state API, and the core engine powers overlay panels such as team summaries, route encounters, capture odds, damage ranges, scoring, and move prediction.

## MVP

The first shippable slice is intentionally small:

- Normalized JSON state contract for party, opponent, bag, location, encounter data, seed, and scoring.
- Dependency-free browser overlay that renders a useful challenge dashboard from that state.
- Core damage and catch calculators with Node tests.
- Gen 3 mGBA adapter notes describing how live Lua export should map into the API.
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

The overlay currently reads `public/sample-state.json`. A live emulator adapter can later write normalized state to `public/live-state.json`, and the UI can be switched to that feed.

## Local Configuration

Copy `.env.example` to `.env` for machine-specific paths such as emulator executables, script directories, save folders, and future live state output paths.

Do not commit `.env`.

## Architecture

```text
Emulator Adapter
  Reads memory from mGBA, VBA-RR, BizHawk, or another source.

Game Adapter
  Maps generation and ROM-specific memory/data into the normalized API.

Data Adapter
  Supplies species, moves, items, type chart, learnsets, trainers, encounters, and hack-specific changes.

Core Engine
  Calculates damage, capture odds, scoring, legality, projections, and predictions.

Overlay
  Displays current state and engine outputs.
```

## Roadmap

1. Live Gen 3 party/opponent export from mGBA Lua.
2. Projected opponent damage into each party member.
3. Bag-aware capture odds and TM compatibility.
4. Route encounter visualization.
5. Battle Factory set identification.
6. Custom challenge scoring rules.
7. ROM hack data adapters.

## Maintainer Docs

- `AGENTS.md` - required guide for coding agents.
- `CONTRIBUTING.md` - public contribution flow.
- `docs/README.md` - documentation index, project memory, architecture notes, and roadmap.
- `docs/project/community-extensions.md` - policy for reviewed community adapters, ROM-hack mappings, data packs, rulesets, and overlay panels.
