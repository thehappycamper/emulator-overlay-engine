# Libretro Emerald Adapter (P05-T014)

A thin adapter connecting the isolated, fully generic Libretro provider (`experiments/libretro-provider/`) to the existing, game-owned Pokemon Emerald acquisition contract (`adapters/pokemon-emerald-us-rev0/`).

## Boundary

```text
EOE process
  -> Libretro provider client / JSON-lines IPC          (experiments/libretro-provider/, generic, no Emerald knowledge)
  -> Libretro provider child -> official mGBA core       (generic memory reads / frame execution)
  -> this adapter (reader.js / identity.js / acquire.js) (thin: address translation + snapshot buffering only)
  -> adapters/pokemon-emerald-us-rev0/                   (existing Gen III decoding, species/move/item lookups, identity)
  -> existing provider-neutral source contract / mapping / Pokemon normalized state
```

`experiments/libretro-provider/` never gains Emerald/Pokemon knowledge because of this task, and never will because of any future one built on this same pattern. Everything Emerald-specific - memory addresses, struct layout, decryption, name lookups - stays inside `adapters/pokemon-emerald-us-rev0/`, exactly as it already does for the mGBA and BizHawk providers.

## Why a snapshot, not per-field IPC reads

`readEmeraldAcquisition(reader)` (the existing, reused acquisition function) calls `reader.read8/16/32(address)` synchronously, dozens of times per acquisition. Libretro IPC is inherently asynchronous. This adapter bridges that by fetching one bounded snapshot per verified GBA memory domain (EWRAM, IWRAM) via two `readRange` IPC calls, then handing `readEmeraldAcquisition` a synchronous reader backed by those already-fetched buffers - no further IPC occurs during acquisition itself. This preserves the exact same synchronous reader contract every other provider's reader already satisfies.

## Files

- `reader.js` - resolves the isolated provider's own discovered memory regions against the two verified GBA domains (EWRAM `0x02000000`/`0x40000`, IWRAM `0x03000000`/`0x8000`, matching `adapters/bizhawk/gba-memory-domains.js`'s own constants exactly), fetches a bounded snapshot of each, and exposes a synchronous `{read8, read16, read32}` reader over that snapshot.
- `identity.js` - computes Emerald ROM identity by hashing the local ROM file directly (CRC32), then delegates the accept/reject decision to the existing, unmodified `assertSupportedEmeraldIdentity`.
- `acquire.js` - the orchestration entry point: `acquireEmeraldSourceSnapshot()` runs initialize → core check → identity check → region resolution → snapshot fetch → the existing `readValidatedEmeraldSourceSnapshot(LIBRETRO_SOURCE, identity, reader)`. `runOnceEmeraldLibretroAcquisition()` wraps that in a try/finally that always shuts the provider down, success or failure.

`LIBRETRO_SOURCE` (the provenance descriptor) lives alongside `MGBA_SOURCE`/`BIZHAWK_SOURCE` in `adapters/pokemon-emerald-us-rev0/emerald-source-contract.js`, matching where those already live.

## Local validation

```powershell
npm install
npm test
```

For a real local proof, use the existing official-core configuration convention (`experiments/libretro-direct-host/.env.local` / `.env.local.example`: `LIBRETRO_CORE_PATH`, `EMERALD_ROM_PATH`), plus optionally `EMERALD_SOURCE_SNAPSHOT_PATH`/`EOE_LIVE_STATE_PATH` to publish output files, then run:

```powershell
npm run proof:emerald:libretro -- --check   # validates config and ROM identity, launches nothing
npm run proof:emerald:libretro              # acquires one snapshot, maps it, exits
```

Do not commit ROMs, saves, savestates, BIOS files, or core binaries.

## Explicit non-goals

Input injection, savestates, memory writes, controller UI, audio/video output, core downloading/updating, achievements/netplay, and a full Libretro frontend. This adapter does not duplicate Gen III structure decoding, species/move/item/location lookup logic, or add Libretro-specific branches to Pokemon presentation or normalized-state mapping - all of that remains exclusively owned by `adapters/pokemon-emerald-us-rev0/` and `src/domains/pokemon/`.
