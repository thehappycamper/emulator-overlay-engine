# Example Fusion Data Extension

This example shows how a contributor could model a game with fused or composed Pokemon.

The extension supplies data. It does not read emulator memory and does not render UI directly.

## Supported Target

- Game: Example Fusion Game
- Version: 1.0.0
- Generation baseline: 3

## Data Files

Suggested layout:

```text
extension.json
README.md
data/
  fusion-species.json
  encounters.json
  learnsets.json
fixtures/
  normalized-fusion-state.json
```

## Fusion Representation

Expose final battle-ready Pokemon through normalized state. Use `components` and `sourceIds` to preserve fusion-specific identity.

