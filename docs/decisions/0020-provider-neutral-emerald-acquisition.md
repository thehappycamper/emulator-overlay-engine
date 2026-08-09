# ADR 0020: Provider-Neutral Emerald Acquisition Ownership

Date: 2026-08-08

Status: accepted

Supersedes: the provider-ownership and source-identity portions of ADR 0018 and ADR 0019

## Context

The first live source was developed under `adapters/gen3-mgba/`, and its contract ID encoded `mgba`. That was honest for Proof 1, but it placed Emerald addresses, Gen III decoding, schema, fixture, and mapping under one emulator provider. BizHawk can read the same exact Emerald state. Giving it a parallel contract or copied decoding would force downstream mappings to branch on acquisition method and allow the implementations to drift.

Provider provenance is still useful. A provider-neutral semantic contract must not erase whether values came from mGBA or BizHawk, especially while BizHawk verifies System Bus values against direct EWRAM/IWRAM domains.

## Decision

Define the game-owned source contract:

```text
pokemon.emerald.us-rev0.acquisition@1.0.0
```

Its canonical schema, fixtures, pure decoding, shared Lua acquisition module, and declarative Pokemon-state mapping live under `adapters/pokemon-emerald-us-rev0/`.

Emulator providers own only emulator-specific responsibilities: lifecycle, identity APIs, memory API/domain access, local publication, and setup. Both mGBA and BizHawk load the same Emerald Lua acquisition module, so addresses and Gen III party decoding are not duplicated between providers.

The contract includes a narrow `source` provenance object with provider identity, integration method, and memory-space diagnostics. The game fields remain provider-neutral. The existing mapping reads the provider display name for diagnostics and preserves provenance under normalized `extensions`, but all Pokemon state fields use one mapping path.

BizHawk uses `System Bus` addresses and verifies every known WRAM read against a translated direct EWRAM/IWRAM offset before publishing. Unsupported emulator version, system, ROM hash, domain shape, memory disagreement, or invalid acquisition state fails closed.

Prior mGBA JavaScript module paths remain compatibility re-exports. The old mGBA-named JSON contract is not emitted by either provider; its distinct ID remains historical rather than being silently reinterpreted.

## Consequences

- Provider adapters no longer own shared game semantics.
- A second emulator reuses the established mapping, Pokemon domain, target validation, atomic live-state handoff, and overlay.
- Provider provenance remains observable without becoming a downstream dispatch mechanism.
- Source contract consumers must adopt the new provider-neutral ID and required `source` metadata.
- The current source remains Emerald Rev 0-specific and fixed-slot; this decision does not create a universal provider runtime, generalized game-composition framework, or second domain.
- Real BizHawk Proof 2 acceptance still requires an operator session with a legally obtained ROM. Repository tests cannot substitute for that evidence.
