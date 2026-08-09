# ADR 0028: Libretro Emerald Thin Adapter

- **Status:** Accepted for the P05-T014 vertical slice
- **Date:** 2026-08-09

## Context

P05-T013 delivered an isolated, fully generic Libretro provider (`experiments/libretro-provider/`): a child process hosting the official mGBA core behind a local JSON-lines IPC boundary, exposing only lifecycle, identity, capabilities, discovered memory regions, and bounded reads - deliberately with no Pokemon or Emerald knowledge of any kind. On its own it proves nothing about Emerald acquisition; it is a generic memory-access primitive.

`adapters/pokemon-emerald-us-rev0/` already owns the complete Gen III Emerald decoding logic (struct layout, decryption, species/move/item/location lookups, identity verification) behind a synchronous, provider-neutral reader contract (`readEmeraldAcquisition(reader)`, requiring `{read8, read16, read32}`), already reused unmodified by the mGBA and BizHawk providers' own Lua ports of the same logic.

The platform needs to prove these two pieces connect without either one absorbing the other's responsibilities: the Libretro provider must not gain Emerald semantics, and the Emerald acquisition layer must not gain Libretro-specific memory-access code.

## Decision

A new adapter package, `adapters/libretro-emerald/`, is the only place this connection is made. It is thin by construction: `reader.js` translates the Libretro provider's own discovered memory regions into the two verified GBA domains every other provider already claims (EWRAM `0x02000000`/`0x40000`, IWRAM `0x03000000`/`0x8000`, matching `adapters/bizhawk/gba-memory-domains.js`'s constants exactly) and builds a synchronous reader; `identity.js` computes ROM identity by hashing the local ROM file (CRC32) and delegates the accept/reject decision entirely to the existing, unmodified `assertSupportedEmeraldIdentity`; `acquire.js` sequences initialize → core check → identity check → region resolution → snapshot fetch → the existing `readValidatedEmeraldSourceSnapshot(LIBRETRO_SOURCE, identity, reader)`.

Unlike mGBA and BizHawk, this adapter calls the canonical JS `readEmeraldAcquisition` directly - no Lua port exists or is needed, since the Libretro provider is a genuine Node.js child process reachable by the parent process's own JS. The one genuinely new problem this adapter solves is bridging `readEmeraldAcquisition`'s synchronous reader contract against Libretro IPC's inherent asynchrony: rather than one IPC round trip per field read (which the existing decoder makes dozens of per acquisition), the adapter fetches one bounded snapshot per verified region via two `readRange` calls, then hands the decoder a synchronous reader backed by those already-fetched buffers. No further IPC occurs during decoding.

`LIBRETRO_SOURCE` (provenance: `{provider: {id: "libretro", ...}, integration: "libretro-ipc", memory: {...}}`) is added to `adapters/pokemon-emerald-us-rev0/emerald-source-contract.js` alongside `MGBA_SOURCE`/`BIZHAWK_SOURCE`, matching where those already live - this is Emerald-contract metadata about a known provider, not Emerald logic inside the provider.

A bounded, one-shot CLI (`tools/proof-libretro-emerald.mjs`, `npm run proof:emerald:libretro`) proves the pipeline locally: initialize, acquire one snapshot, map it, optionally publish both, shut down, exit. It does not duplicate P05-T012's session orchestrator and is not a polling loop or a frontend.

## Consequences

- `experiments/libretro-provider/` remains completely generic; no Emerald/Pokemon code was added to it, and this ADR does not authorize any future task to add any.
- `adapters/pokemon-emerald-us-rev0/` gained no Libretro-specific branches; `readEmeraldAcquisition`, the decryption/lookup logic, and `assertSupportedEmeraldIdentity` are called, not modified.
- A third provider now proves the existing provider-neutral contract genuinely is provider-neutral: mGBA, BizHawk, and Libretro all produce normalized state that is identical except for provenance, verified by extending the existing provider-parity test rather than writing a separate one.
- Real-savestate acceptance (a party with actual Pokemon) remains out of scope: the Libretro provider has no savestate-loading capability (by P05-T013's own explicit non-goals) and this task adds none, so a real end-to-end smoke against the official core and a real ROM necessarily observes only boot-state (empty party, no active battle) - a disclosed, structural limitation of this vertical slice, not a defect.
- This does not make Libretro a production-default provider or close the broader `P05`/`P06` live-overlay acceptance gate, which still requires real mGBA/BizHawk acceptance with actual in-game save data.
