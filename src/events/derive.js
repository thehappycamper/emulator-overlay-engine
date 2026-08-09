// Domain-neutral semantic event derivation (ADR 0013): compares consecutive
// validated normalized-state snapshots and runs a caller-supplied list of
// detector functions over that pair, stamping and validating whatever
// events they emit against the shared envelope schema.
//
// This module knows nothing about Pokemon, Emerald, BizHawk, mGBA, or any
// other domain/provider - it operates purely on `(previousState,
// currentState)` and a list of detector functions the caller provides.
// Domain packages (e.g. src/domains/pokemon) own the actual interpretation
// (which detectors exist, what a "subject" reference means, what counts as
// a transition) and call this module's `deriveEvents()` to turn that
// interpretation into validated envelope-shaped events.
//
// Input is intentionally two full, already-validated normalized-state
// snapshots, not raw emulator memory and not a diff/patch format - matching
// this project's existing "normalized state is the description of what is
// true now" boundary (ADR 0013's Consequences).

import { assertValidEvent } from "./validate.js";

// A detector is `(previousState, currentState) => partialEvent[] | null |
// undefined`, where a partial event omits `sequence`/`detectedAt` (assigned
// here) and may omit `provenance` (defaulted from the `deriveEvents` call's
// own `provenance` option). Detectors must be pure: no mutation of either
// state argument, no I/O, no randomness/clock reads of their own - `now`
// is injected so detection is deterministic and testable.

// Creates a session-scoped sequence/timestamp stamper. Create exactly one
// per session and reuse it across every `deriveEvents` call for that
// session, so `sequence` stays monotonic across the whole event stream -
// not just within one snapshot pair. `deriveEvents` creates its own
// one-shot stamper by default, which is only appropriate for a single
// isolated call (e.g. a test).
export function createEventSequencer({ now = () => new Date().toISOString() } = {}) {
  let sequence = 0;
  return function stampEvent(partialEvent, defaultProvenance) {
    sequence += 1;
    return Object.freeze({
      type: partialEvent.type,
      sequence,
      detectedAt: now(),
      subject: partialEvent.subject ?? null,
      previous: partialEvent.previous ?? null,
      current: partialEvent.current ?? null,
      // `detector` defaults to the event's own `type` (the common case: one
      // detector emits one event type) but a detector emitting more than
      // one type from shared logic may set `provenance.detector` itself to
      // name which specific rule fired.
      provenance: Object.freeze({
        detector: partialEvent.type,
        ...(defaultProvenance ?? {}),
        ...(partialEvent.provenance ?? {}),
      }),
    });
  };
}

// Runs every detector against `(previousState, currentState)` and returns a
// flat, validated, sequenced array of events in detector order (and, within
// one detector's own returned array, in that array's order).
//
// Returns `[]` without running any detector when `previousState` is
// nullish: with no prior snapshot there is nothing to transition from, so
// nothing has "happened" yet by this module's own definition of an event
// (ADR 0013: state describes what is true now, events describe what
// happened). This is enforced centrally, once, rather than trusted to
// every individual detector, so a first-ever observed snapshot - even one
// already mid-battle with a full party - never fabricates a burst of
// "everything just appeared" events.
export function deriveEvents(previousState, currentState, detectors, options = {}) {
  const { stampEvent = createEventSequencer(), provenance } = options;

  if (previousState == null || currentState == null) {
    return [];
  }
  if (!Array.isArray(detectors)) {
    throw new TypeError("deriveEvents requires an array of detector functions");
  }

  const events = [];
  for (const detector of detectors) {
    if (typeof detector !== "function") {
      throw new TypeError("Every detector must be a function");
    }
    const partials = detector(previousState, currentState) ?? [];
    for (const partial of partials) {
      const event = stampEvent(partial, provenance);
      assertValidEvent(event);
      events.push(event);
    }
  }
  return events;
}
