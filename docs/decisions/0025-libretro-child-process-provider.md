# ADR 0025: Isolate Native Libretro Cores Behind a Child-Process Provider

- **Status:** accepted for P05-T013 prototype
- **Date:** 2026-08-09

## Context

P05-T007 established that EOE can host an official mGBA Libretro core directly, but loading arbitrary native libraries into the main EOE process would make a core crash or ABI defect a process-wide failure. The operator subsequently verified the direct-host fundamentals with a real Emerald session.

## Decision

The first Libretro provider prototype runs the native core in a separate child process. The parent communicates through a local, versioned JSON-lines protocol covering lifecycle, identity, capabilities, memory-region discovery, bounded read operations, frame execution, structured errors, and shutdown.

The child owns all Libretro ABI and Koffi behavior. The parent does not load native cores. Memory is exposed as provider-neutral discovered regions and byte/value reads. Pokémon, Emerald, mapping, normalized state, and overlay behavior remain outside this provider boundary.

## Consequences

- A native core crash or hang does not directly terminate the parent process; the client reports child exit or request timeout.
- The child can fail closed on ABI mismatch, malformed content, inaccessible regions, and invalid bounds.
- The protocol is intentionally local, unauthenticated, and experimental. It is not a network API, sandbox, installer, or security boundary against a fully hostile child process.
- Read operations are currently little-endian for 16/32-bit values and range reads are bounded to 1 MiB.
- One bootstrap frame may execute during initialization because some cores publish memory maps on their first frame.
- Writes, input, savestates, audio/video, core management, and production frontend concerns remain separate future decisions.

## Alternatives rejected

Loading the core into the main process was rejected because native faults and hangs would share the parent failure domain. A WebSocket or daemon service was rejected as premature; local child-process IPC is sufficient for this proof. A generic plugin installer or sandbox was rejected as out of scope and requires a separate trust/security decision.
