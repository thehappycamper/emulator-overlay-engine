# Emulator Compatibility

The engine is source-agnostic; an emulator is one source-provider type, not a platform assumption (see `docs/knowledge/adapter-contracts.md`). Compatibility is provided by emulator extensions that emit a source contract for declarative mapping, or — as a documented early-integration exception — a reviewed normalized target directly.

## Known Local Targets

| Emulator | Status | Notes |
| --- | --- | --- |
| mGBA 0.10.3 | active live integration | `adapters/gen3-mgba/emerald-acquisition.lua` supplies mGBA reads to the shared `pokemon.emerald.us-rev0.acquisition@1.0.0` game adapter; the existing mapper validates and atomically writes `public/live-state.json`. Richer fields and real end-to-end smoke evidence remain outstanding. |
| VBA-RR | planned extension | Has Lua support and can draw overlays directly. Good fallback for classic Lua overlays. |
| VisualBoyAdvance-M | unknown | Standalone executable detected locally. Lua support depends on build and configuration. |
| BizHawk 2.11.1 | active Proof 2 acquisition | `npm run proof:bizhawk` starts Emerald Rev 0 and auto-loads the Lua provider. It checks version/system/SHA-1 plus System Bus/direct EWRAM-IWRAM parity, emits the shared Emerald contract, and reuses the existing mapper/domain/overlay. Real-ROM acceptance evidence remains outstanding. |
| Libretro child provider prototype | active experiment | `experiments/libretro-provider/` runs arbitrary native cores outside the parent EOE process through local JSON-lines IPC. It is provider-neutral and currently exposes identity, capabilities, memory-region discovery, bounded reads, frame execution, errors, and shutdown; it is not production frontend or overlay integration. |

## Adapter Requirements

An emulator adapter should:

- Read live emulator/game state.
- Emit a documented source contract for mapping into `src/domains/pokemon/schemas/overlay-state.schema.json`, or, during early integration, write that normalized shape directly as a reviewed exception (see `docs/knowledge/adapter-contracts.md`'s Source And Export Shape).
- Avoid embedding UI behavior.
- Avoid embedding generic damage/capture/scoring logic.
- Document supported emulator version, ROM/game target, and known limitations.
- Include an `extension.json` manifest.

## First Adapter Target

First live target: Gen 3 mGBA export. `P05-T002` proved acquisition for mGBA 0.10.3 and English retail Pokemon Emerald Rev 0 (`AGB-BPEE`, CRC32 `1F1C08FB`); `P05-T003` defines the named source contract; `P05-T004` maps it into validated Pokemon state and the existing overlay file handoff; `P05-T005` adds the local-only setup/launch workflow without changing emulator compatibility.

Reason:

- mGBA is actively maintained and has script support.
- The provider keeps emulator APIs and version-specific addresses at the adapter boundary while the declarative mapping feeds the domain-owned state contract.

## Second Emulator Target

BizHawk 2.11.1 is the Proof 2 target. `P06-T001` chose its supported `--lua` bootstrap; `P06-T002` makes that provider emit the game-owned Emerald contract without copying Pokemon decoding/calculation logic. Both providers now compose with one shared Emerald acquisition module and one downstream mapping.

BizHawk C#/.NET External Tools remain a documented longer-term option for richer typed integration. They are not used for the bootstrap because they require a compiled .NET Framework 4.8 assembly in BizHawk's `ExternalTools` directory, carry tighter assembly/trust coupling, and provide no benefit needed by this first proof.
