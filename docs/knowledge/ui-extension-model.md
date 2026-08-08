# UI Extension Model

The overlay UI should be extensible without requiring every new panel to become core code.

Overlays are EOE's first visible product surface. They currently consume normalized state and engine outputs. In the future, overlays may also react to normalized semantic events or be targeted by actions, but no event subscription or action contract exists yet.

## Goals

- Let community extensions add panels for new games, ROM hacks, facilities, routes, score systems, or fusion mechanics.
- Keep the core overlay stable.
- Let panels consume normalized state and extension-provided data.
- Keep private/local data out of public manifests.

## Panel Slots

Overlay panel extensions should declare one or more preferred slots:

| Slot | Purpose |
| --- | --- |
| `party` | Party/team information. |
| `battle` | Current opponent, damage, prediction, and switch projections. |
| `location` | Route, encounter, and catch information. |
| `score` | Challenge scoring and projected penalties. |
| `inspector` | Detailed selected Pokemon, move, item, or trainer data. |
| `sidebar` | Compact persistent panels. |
| `custom` | Extension-specific layouts that do not fit standard slots. |

The host overlay decides final placement. Slots are preferences, not absolute layout control.

## Data Flow

```text
normalized state
  + extension data
  + engine outputs
  + analysis outputs
      -> overlay host
          -> panel extension
```

Panel extensions should read data. They should not mutate emulator state.

## Extension State

Extension-specific runtime data can live under the top-level normalized state `extensions` object:

```json
{
  "extensions": {
    "example.fusion-data": {
      "selectedFusionId": 1000123,
      "fusionConfidence": 1
    }
  }
}
```

Keys should use extension IDs to avoid collisions.

## Panel Contract

A future panel runtime should provide:

- Normalized state.
- Engine outputs.
- Extension registry metadata.
- Read-only extension data.
- A DOM/container or framework adapter.

Panel extensions should declare required state fields and degrade gracefully when data is missing.

## Trust Boundary

Executable panel entrypoints are currently trusted only through repository review. The safe mapping-expression AST does not sandbox panel JavaScript. Loading executable panels dynamically from a future installer, runtime, or marketplace requires a separate sandboxing and permissions decision before unreviewed code is accepted.
