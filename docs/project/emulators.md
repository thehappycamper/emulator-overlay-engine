# Emulator Compatibility

The engine is source-agnostic; an emulator is one source-provider type, not a platform assumption (see `docs/knowledge/adapter-contracts.md`). Compatibility is provided by emulator extensions that emit a source contract for declarative mapping, or — as a documented early-integration exception — a reviewed normalized target directly.

## Known Local Targets

| Emulator | Status | Notes |
| --- | --- | --- |
| mGBA 0.10.3 | active source integration | `adapters/gen3-mgba/emerald-acquisition.lua` supports the exact English retail Emerald Rev 0 fingerprint and emits `pokemon.emerald.us-rev0.mgba.acquisition@1.0.0` snapshots with party HP/species, battle/opponent, and map values. Mapping and normalized export are not implemented. |
| VBA-RR | planned extension | Has Lua support and can draw overlays directly. Good fallback for classic Lua overlays. |
| VisualBoyAdvance-M | unknown | Standalone executable detected locally. Lua support depends on build and configuration. |
| BizHawk | candidate | Good future option for multi-system tooling and Lua support, not currently scaffolded. |

## Adapter Requirements

An emulator adapter should:

- Read live emulator/game state.
- Emit a documented source contract for mapping into `src/domains/pokemon/schemas/overlay-state.schema.json`, or, during early integration, write that normalized shape directly as a reviewed exception (see `docs/knowledge/adapter-contracts.md`'s Source And Export Shape).
- Avoid embedding UI behavior.
- Avoid embedding generic damage/capture/scoring logic.
- Document supported emulator version, ROM/game target, and known limitations.
- Include an `extension.json` manifest.

## First Adapter Target

First live target: Gen 3 mGBA export. `P05-T002` proved acquisition for mGBA 0.10.3 and English retail Pokemon Emerald Rev 0 (`AGB-BPEE`, CRC32 `1F1C08FB`); `P05-T003` defines and emits the first named source contract. Mapping into Pokemon normalized state remains the next task.

Reason:

- mGBA is actively maintained and has script support.
- The provider can keep emulator APIs and version-specific addresses at the adapter boundary before later source-contract and mapping tasks.
