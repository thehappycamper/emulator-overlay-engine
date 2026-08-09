# BizHawk Pokemon Emerald Provider

This adapter uses BizHawk 2.11.1 Lua to publish the shared game-owned `pokemon.emerald.us-rev0.acquisition@1.0.0` contract. It then reuses the existing Emerald mapping, canonical Pokemon state validation, atomic `public/live-state.json` handoff, Pokemon domain, and overlay.

## Supported Target

- Windows x64 [BizHawk 2.11.1](https://github.com/TASEmulators/BizHawk/releases/tag/2.11.1), using `BizHawk-2.11.1-win-x64.zip` and `EmuHawk.exe`.
- Pokemon Emerald English retail Rev 0, SHA-1 `F3AE088181BF583E55DAF962A92BB46F4F1D07B7`.
- GBA system ID `GBA`.

The launcher and connector fail closed when emulator version, system ID, ROM hash, required memory domains, domain sizes, or acquired state do not match the supported target. Failure removes the provider's configured source snapshot rather than leaving stale acquisition data behind.

## Ownership Boundary

`proof-connector.lua` owns BizHawk identity APIs, memory-domain access, frame progression, and source-file publication. It contains no Emerald addresses or Gen III Pokemon decoding. Those semantics live once in `adapters/pokemon-emerald-us-rev0/emerald-acquisition.lua` and are shared with mGBA.

The Node-side schema, fixture, mapping, target validation, and complete-file writers are also game-owned in that package. Compatibility re-exports remain at the prior mGBA JavaScript paths for incremental consumers.

## Memory Semantics

BizHawk 2.11.1's mGBA GBA core defines `System Bus` as a `0x10000000`-byte bus domain, `EWRAM` as `0x40000` bytes, and `IWRAM` as `0x8000` bytes. The Lua memory API accepts an explicit domain for `read_u8`, `read_u16_le`, and `read_u32_le`.

The connector verifies those domains and sizes at startup. For every acquisition read it:

1. reads the known `0x020...` or `0x030...` address from `System Bus`;
2. translates it to the direct EWRAM/IWRAM offset;
3. reads the same width from that direct domain;
4. refuses publication if the values differ.

This check runs against the actual loaded game during the operator smoke. Repository tests prove the translation/ownership wiring synthetically, but do not fabricate real-ROM evidence.

Upstream references: [GBA memory-domain implementation](https://github.com/TASEmulators/BizHawk/blob/2.11.1/src/BizHawk.Emulation.Cores/Consoles/Nintendo/GBA/MGBAHawk.IMemoryDomains.cs), [Lua memory library](https://github.com/TASEmulators/BizHawk/blob/2.11.1/src/BizHawk.Client.Common/lua/CommonLibs/MemoryLuaLibrary.cs), and [command-line arguments](https://github.com/TASEmulators/BizHawk/blob/2.11.1/README.md#passing-command-line-arguments).

## Local Proof 2 Workflow

1. Download and extract the official Windows x64 BizHawk 2.11.1 release outside this repository.
2. Copy `.env.bizhawk.local.example` to `.env.bizhawk.local`.
3. Set `EOE_BIZHAWK_EXE` and your legally obtained Emerald Rev 0 path. Optionally set a BizHawk savestate.
4. Validate the entire session (BizHawk, mapper, and server configuration, including port availability) without launching anything:

```powershell
npm run proof:emerald:bizhawk -- --check
```

5. Launch the full session - BizHawk with the ROM/savestate/connector, the mapper, and the overlay server - with one command:

```powershell
npm run proof:emerald:bizhawk
```

Child process output is prefixed (`[bizhawk]`/`[mapper]`/`[server]`) in the one terminal. BizHawk itself has no meaningful stdout of its own (its Lua console writes to a GUI panel, not this terminal) - `[bizhawk]` lines are session status only, not BizHawk's own output. Ctrl+C stops the entire session, including BizHawk; if any child exits unexpectedly, the rest are stopped too rather than left running. See `docs/tasks/P05/P05-T012.md` for the full session-orchestration design.

6. Inspect `EMERALD_SOURCE_SNAPSHOT_PATH`. It must identify provider `bizhawk`, primary domain `System Bus`, and verified domains `EWRAM` and `IWRAM`.
7. Confirm `public/live-state.json` identifies `game.adapter` as `BizHawk`, then open the overlay URL the session printed.
8. Record first-party HP, take damage or heal, and confirm source snapshot, normalized state, and overlay HP all change without restarting.
9. Enter/leave battle or change maps and confirm at least one additional acquired value changes.

That real-ROM session is the Proof 2 acceptance gate. Until its observations are recorded, this task establishes the implementation path but does not claim Proof 2 or P06 complete.

### Diagnostics: the individual commands still work

`npm run proof:bizhawk -- --check` / `npm run proof:bizhawk`, `npm run live:emerald`, and `npm start` remain available unchanged for isolating a single stage (e.g. iterating on the mapper without relaunching BizHawk each time). `npm run proof:emerald:bizhawk` composes exactly these same, already-reviewed building blocks - it does not replace or duplicate their logic.

## Why Lua Remains Sufficient

BizHawk's supported `--lua` startup path can access identity, memory domains, frame progression, and local files needed for this proof. A C#/.NET External Tool would add compiled deployment and assembly coupling without closing a current gap. Reconsider it only if a later requirement demonstrates a concrete Lua limitation.

No ROM, BIOS, save, savestate, emulator binary, credential, or machine-specific path belongs in this repository.
