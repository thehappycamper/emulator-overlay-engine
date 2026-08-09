# Emulator Compatibility

The engine is source-agnostic; an emulator is one source-provider type, not a platform assumption (see `docs/knowledge/adapter-contracts.md`). Compatibility is provided by emulator extensions that emit a source contract for declarative mapping, or — as a documented early-integration exception — a reviewed normalized target directly.

## Known Local Targets

| Emulator | Status | Notes |
| --- | --- | --- |
| mGBA 0.10.3 | active live integration | `adapters/gen3-mgba/emerald-acquisition.lua` emits strict-fingerprint `pokemon.emerald.us-rev0.mgba.acquisition@1.0.0`; `npm run live:emerald` maps it into validated `pokemon.overlay-state@0.1.0` and atomically writes `public/live-state.json`. `npm run proof:emerald` validates local paths, prepares directories, and launches the configured ROM. Richer fields and real end-to-end smoke evidence remain outstanding. |
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

First live target: Gen 3 mGBA export. `P05-T002` proved acquisition for mGBA 0.10.3 and English retail Pokemon Emerald Rev 0 (`AGB-BPEE`, CRC32 `1F1C08FB`); `P05-T003` defines the named source contract; `P05-T004` maps it into validated Pokemon state and the existing overlay file handoff; `P05-T005` adds the local-only setup/launch workflow without changing emulator compatibility.

Reason:

- mGBA is actively maintained and has script support.
- The provider keeps emulator APIs and version-specific addresses at the adapter boundary while the declarative mapping feeds the domain-owned state contract.
