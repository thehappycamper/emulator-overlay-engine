# BizHawk Proof 2 Bootstrap

This adapter establishes BizHawk as the second emulator target without duplicating Pokemon mechanics or pretending the existing mGBA-specific source contract is provider-neutral. The repository launcher starts a supported Emerald image and auto-loads `proof-connector.lua`. The connector validates the emulator, system, and ROM hash, then writes a changing diagnostic heartbeat.

This is a bootstrap proof, not a normalized source pipeline. It does not emit `pokemon.emerald.us-rev0.mgba.acquisition@1.0.0`, invoke the Emerald mapping, or write `public/live-state.json`.

## Supported Target

- Windows x64 [BizHawk 2.11.1](https://github.com/TASEmulators/BizHawk/releases/tag/2.11.1), using `BizHawk-2.11.1-win-x64.zip` and `EmuHawk.exe`.
- Pokemon Emerald English retail Rev 0, SHA-1 `F3AE088181BF583E55DAF962A92BB46F4F1D07B7`.
- GBA system ID `GBA`.

The hash is also present in BizHawk 2.11.1's [bundled GBA game database](https://github.com/TASEmulators/BizHawk/blob/2.11.1/Assets/gamedb/gamedb_gba.txt). The connector fails closed and leaves an `unsupported` diagnostic when the BizHawk version, system, or ROM hash differs.

## Why Lua First

BizHawk 2.11.1 officially supports a `--lua` path and a positional ROM path. Its parser also supports `--load-state`, and EmuHawk loads the ROM and state before loading the command-line Lua script when the main window is shown. See the upstream [command-line example](https://github.com/TASEmulators/BizHawk/blob/2.11.1/README.md#passing-command-line-arguments), exact [argument parser](https://github.com/TASEmulators/BizHawk/blob/2.11.1/src/BizHawk.Client.Common/ArgParser.cs), and [Lua API reference](https://tasvideos.org/Bizhawk/LuaFunctions).

This makes Lua the smallest supported Proof 2 integration: one repository-owned script can be auto-loaded with the game, requires no compiled binary, and is easy to inspect. The script uses only generic BizHawk identity/frame APIs. Game expectations come from the launcher environment; party, battle, type, calculation, mapping, and presentation logic are not embedded here.

## External Tools Later

BizHawk also supports C#/.NET [External Tools](https://github.com/TASEmulators/BizHawk-ExternalTools/wiki), and 2.11.1 exposes `--open-ext-tool-dll`. An External Tool is the stronger long-term option if EOE needs a typed API surface, richer lifecycle integration, higher-frequency reads, or a native configuration UI. It is not the smallest proof: current tools target .NET Framework 4.8, live under BizHawk's `ExternalTools` directory, are coupled to BizHawk assemblies, and pass through BizHawk's external-tool trust flow. ROM-specific applicability also complicates launch ordering because external-tool discovery/opening occurs before command-line ROM loading.

No External Tool binary or project is added by this task. Revisit that option only when the Lua proof demonstrates a concrete limitation.

## Local Setup

1. Download and extract the official Windows x64 BizHawk 2.11.1 release outside this repository.
2. Copy `.env.bizhawk.local.example` to `.env.bizhawk.local`.
3. Set the local `EmuHawk.exe` and legally obtained Emerald Rev 0 paths. Optionally set a BizHawk savestate.
4. Validate without launching:

```powershell
npm run proof:bizhawk -- --check
```

5. Launch Emerald and the connector automatically:

```powershell
npm run proof:bizhawk
```

The diagnostic at `BIZHAWK_CONNECTOR_DIAGNOSTIC_PATH` should report `status: connected`, the expected version/hash, and a `runtime.frame` value that advances while the game runs. Lua Console opens automatically because `--lua` implies it in BizHawk's parser.

## Boundary And Next Slice

The existing mGBA source contract includes `mgba` in its public ID, so this connector must not emit it. The next P06 slice should establish reusable Emerald acquisition composition: keep BizHawk API access thin, move genuinely shared Emerald decoding/read semantics to a game-owned layer where needed, and define/version a BizHawk or provider-neutral source contract deliberately. Once that source validates, the existing mapping runtime, Pokemon domain contract, and overlay path should be reused rather than copied into this adapter.

No ROM, BIOS, save, savestate, emulator binary, or machine-specific path belongs in this repository.
