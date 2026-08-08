# Emulator Compatibility

The engine is emulator-agnostic. Compatibility is provided by emulator extensions that export normalized state.

## Known Local Targets

| Emulator | Status | Notes |
| --- | --- | --- |
| mGBA | planned extension | Strong candidate for first live emulator extension. Existing local Lua-style logic can supply Gen 3 party/opponent data. |
| VBA-RR | planned extension | Has Lua support and can draw overlays directly. Good fallback for classic Lua overlays. |
| VisualBoyAdvance-M | unknown | Standalone executable detected locally. Lua support depends on build and configuration. |
| BizHawk | candidate | Good future option for multi-system tooling and Lua support, not currently scaffolded. |

## Adapter Requirements

An emulator adapter should:

- Read live emulator/game state.
- Normalize state into `src/schemas/overlay-state.schema.json`.
- Avoid embedding UI behavior.
- Avoid embedding generic damage/capture/scoring logic.
- Document supported emulator version, ROM/game target, and known limitations.
- Include an `extension.json` manifest.

## First Adapter Target

First live target: Gen 3 mGBA export.

Reason:

- Existing local script already handles Gen 3 Pokemon struct decoding.
- mGBA is actively maintained and has script support.
- The static MVP API can be exercised by writing normalized JSON.
