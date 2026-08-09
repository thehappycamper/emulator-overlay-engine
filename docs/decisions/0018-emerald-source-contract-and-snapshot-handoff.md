# ADR 0018: Emerald Source Contract And Snapshot Handoff

Date: 2026-08-08

Status: accepted; provider ownership and contract identity superseded by ADR 0020

## Context

P05-T002 proved that mGBA can identify English retail Pokemon Emerald Rev 0 and read a small set of changing memory values. Its JSON-shaped text-buffer output was deliberately diagnostic-only. The mapping runtime now needs a stable, reviewable source contract and a local handoff that cannot expose partially written JSON.

This contract is game, revision, and acquisition specific. It is not a shared platform schema and must not be reshaped to imitate the Pokemon normalized-state contract before declarative mapping occurs.

## Decision

Define the adapter-owned source contract:

```text
id: pokemon.emerald.us-rev0.mgba.acquisition
version: 1.0.0
schema: adapters/gen3-mgba/schemas/emerald-us-rev0-source.schema.json
```

The snapshot contains exact supported-ROM identity and the source values currently proven by the acquisition reader: party count, first party record, battle flags and first opponent record, and map identifiers/local coordinates. Raw numeric identifiers and flags retain acquisition semantics. Diagnostic states such as `waiting-for-game`, `unsupported-rom`, and `invalid-memory` are not valid source snapshots.

The mGBA provider publishes a valid snapshot only after strict ROM fingerprint and basic memory plausibility checks. Unsupported or invalid acquisition clears the canonical file rather than replacing it with an error payload that could be mistaken for gameplay data.

Use a local replace-via-temporary-file handoff:

1. serialize the complete snapshot to a sibling temporary file;
2. flush and close it;
3. rename it over the canonical snapshot;
4. remove or retain no partially written canonical target on failure.

The Lua provider writes to the path supplied by `EMERALD_SOURCE_SNAPSHOT_PATH`. The Node reference writer validates against the JSON Schema before replacement. On Windows, Lua's standard-library rename may require removing the old target before the final rename; consumers can briefly observe a missing file but never a partially written JSON target.

Do not point the overlay at this source snapshot. A separately reviewed mapping task must transform it into the Pokemon-owned normalized-state contract before overlay consumption.

## Consequences

- The first concrete named/versioned source contract exists without adding Emerald fields to platform schemas.
- Source fixtures are public-safe derived JSON and receive automated schema validation.
- Unsupported ROMs fail closed and cannot publish a valid-contract snapshot.
- Downstream mapping can identify the source contract without knowing it came from emulator memory.
- The snapshot file is a local single-writer handoff, not a universal transport, event stream, or normalized state file.
- The contract has no timestamp, freshness, provenance/confidence, whole-party, bag, seed/frame, or double-battle model. Those require later reviewed changes and contract versioning where compatibility demands it.
- mGBA's embedded Lua cannot run Ajv. Its repository-reviewed serializer constructs the fixed schema shape after bounded checks; CI pins its contract constants and handoff operations to the validated Node reference and fixture.
