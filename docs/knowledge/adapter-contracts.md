# Adapter Contracts

Adapters are extensions that convert source-specific data into the normalized state API.

## Emulator Adapter Contract

Responsibilities:

- Connect to or run inside the emulator.
- Read live memory/state.
- Export state periodically.
- Document setup and emulator version assumptions.

Non-responsibilities:

- Damage calculations.
- Capture calculations.
- Challenge scoring.
- UI layout.

## Game Adapter Contract

Responsibilities:

- Map memory addresses.
- Decode encrypted or packed game structs.
- Resolve generation-specific IDs.
- Identify game code, revision, or ROM hack target.
- Export normalized state.

Non-responsibilities:

- Generic battle math unless the generation changes the formula.
- Visual presentation.

## Data Adapter Contract

Responsibilities:

- Provide species, moves, items, abilities, encounters, learnsets, TMs, trainers, and Battle Factory sets.
- Document source and version of data.
- Handle ROM hack changes through mapping files or extracted datasets.

Non-responsibilities:

- Emulator memory reads.
- UI layout.

## Export Shape

Live exporters should write JSON matching:

```text
src/schemas/overlay-state.schema.json
```

The first live implementation may write `public/live-state.json` for polling. A later implementation may use WebSockets or another transport, but the payload shape should remain the same.

## Extension Manifest

New adapters should include an `extension.json` manifest. Example manifests live in:

```text
examples/extensions/
```
