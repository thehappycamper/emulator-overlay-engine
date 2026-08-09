# Emulator Compatibility

The engine is source-agnostic; an emulator is one source-provider type, not a platform assumption (see `docs/knowledge/adapter-contracts.md`). Compatibility is provided by emulator extensions that emit a source contract for declarative mapping, or — as a documented early-integration exception — a reviewed normalized target directly.

## Known Local Targets

| Emulator | Status | Notes |
| --- | --- | --- |
| mGBA 0.10.3 | active live integration | `adapters/gen3-mgba/emerald-acquisition.lua` emits strict-fingerprint `pokemon.emerald.us-rev0.mgba.acquisition@1.0.0`; `npm run live:emerald` maps it into validated `pokemon.overlay-state@0.1.0` and atomically writes `public/live-state.json`. `npm run proof:emerald` validates local paths, prepares directories, and launches the configured ROM. Richer fields and real end-to-end smoke evidence remain outstanding. |
| VBA-RR | planned extension | Has Lua support and can draw overlays directly. Good fallback for classic Lua overlays. |
| VisualBoyAdvance-M | unknown | Standalone executable detected locally. Lua support depends on build and configuration. |
| BizHawk 2.11.1 | active Proof 2 bootstrap | `npm run proof:bizhawk` starts Emerald Rev 0 and auto-loads a generic Lua identity/frame connector. Strict version/system/hash diagnostics are implemented; a validated acquisition source contract and mapping handoff are not yet implemented. |

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

BizHawk 2.11.1 is the Proof 2 target. `P06-T001` chooses its supported `--lua` bootstrap because it auto-loads repository-owned code with the ROM and optional state without adding a compiled plugin artifact. The first connector is intentionally emulator-generic and diagnostic-only. It does not copy Pokemon decoding/calculation logic or emit the mGBA-named source contract.

BizHawk C#/.NET External Tools remain a documented longer-term option for richer typed integration. They are not used for the bootstrap because they require a compiled .NET Framework 4.8 assembly in BizHawk's `ExternalTools` directory, carry tighter assembly/trust coupling, and provide no benefit needed by this first proof.
