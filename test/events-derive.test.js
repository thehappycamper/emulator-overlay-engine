import assert from "node:assert/strict";
import test from "node:test";

import { createEventSequencer, deriveEvents } from "../src/events/derive.js";
import { EventValidationError, assertValidEvent } from "../src/events/validate.js";

function validEnvelope(overrides = {}) {
  return {
    type: "example.thing.changed",
    sequence: 1,
    detectedAt: "2026-08-09T00:00:00.000Z",
    subject: null,
    previous: null,
    current: null,
    provenance: { domain: "example", detector: "example.thing.changed" },
    ...overrides,
  };
}

test("assertValidEvent accepts a well-formed envelope and rejects a malformed one", () => {
  assert.equal(assertValidEvent(validEnvelope()), true);

  assert.throws(() => assertValidEvent(validEnvelope({ type: "" })), EventValidationError);
  assert.throws(() => assertValidEvent(validEnvelope({ type: "Not-Lowercase" })), EventValidationError);
  assert.throws(() => assertValidEvent(validEnvelope({ detectedAt: "not-a-date" })), EventValidationError);
  assert.equal(assertValidEvent(validEnvelope({ detectedAt: "2026-08-09T00:00:00.000Z" })), true);
  assert.throws(() => assertValidEvent({ ...validEnvelope(), extra: "not allowed" }), EventValidationError);
  assert.throws(() => {
    const event = validEnvelope();
    delete event.provenance;
    assertValidEvent(event);
  }, EventValidationError);
});

test("deriveEvents returns [] without running any detector when there is no previous state", () => {
  const detector = () => {
    throw new Error("must not be called when previousState is null");
  };
  assert.deepEqual(deriveEvents(null, { a: 1 }, [detector]), []);
  assert.deepEqual(deriveEvents(undefined, { a: 1 }, [detector]), []);
});

test("deriveEvents returns [] without running any detector when there is no current state", () => {
  const detector = () => {
    throw new Error("must not be called when currentState is null");
  };
  assert.deepEqual(deriveEvents({ a: 1 }, null, [detector]), []);
});

test("deriveEvents stamps type/sequence/detectedAt/provenance and validates each emitted event", () => {
  const detector = () => [{ type: "example.thing.changed", subject: { id: 1 }, previous: { v: 1 }, current: { v: 2 } }];
  const events = deriveEvents(
    { x: 1 },
    { x: 2 },
    [detector],
    { stampEvent: createEventSequencer({ now: () => "2026-08-09T00:00:00.000Z" }), provenance: { domain: "example" } },
  );
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    type: "example.thing.changed",
    sequence: 1,
    detectedAt: "2026-08-09T00:00:00.000Z",
    subject: { id: 1 },
    previous: { v: 1 },
    current: { v: 2 },
    provenance: { detector: "example.thing.changed", domain: "example" },
  });
});

const exampleProvenance = { provenance: { domain: "example" } };

test("deriveEvents runs every detector and flattens/concatenates their results in order", () => {
  const detectorA = () => [{ type: "example.a" }];
  const detectorB = () => [{ type: "example.b1" }, { type: "example.b2" }];
  const detectorC = () => [];
  const events = deriveEvents({ x: 1 }, { x: 2 }, [detectorA, detectorB, detectorC], exampleProvenance);
  assert.deepEqual(events.map((e) => e.type), ["example.a", "example.b1", "example.b2"]);
});

test("a shared sequencer keeps sequence numbers monotonic across multiple deriveEvents calls", () => {
  const stampEvent = createEventSequencer({ now: () => "2026-08-09T00:00:00.000Z" });
  const detector = () => [{ type: "example.thing.changed" }];
  const options = { stampEvent, ...exampleProvenance };

  const first = deriveEvents({ x: 1 }, { x: 2 }, [detector], options);
  const second = deriveEvents({ x: 2 }, { x: 3 }, [detector], options);
  const third = deriveEvents({ x: 3 }, { x: 4 }, [() => []], options);

  assert.deepEqual(first.map((e) => e.sequence), [1]);
  assert.deepEqual(second.map((e) => e.sequence), [2]);
  assert.deepEqual(third, []);
});

test("a detector emitting an envelope-invalid partial event fails closed rather than silently passing through", () => {
  const detector = () => [{ type: "Not Valid" }];
  assert.throws(() => deriveEvents({ x: 1 }, { x: 2 }, [detector], exampleProvenance), EventValidationError);
});

test("a detector emitting an event missing required provenance (e.g. no domain supplied at all) fails closed", () => {
  const detector = () => [{ type: "example.a" }];
  assert.throws(() => deriveEvents({ x: 1 }, { x: 2 }, [detector]), EventValidationError);
});

test("deriveEvents rejects non-array detector lists and non-function detectors", () => {
  assert.throws(() => deriveEvents({ x: 1 }, { x: 2 }, "not-an-array"), TypeError);
  assert.throws(() => deriveEvents({ x: 1 }, { x: 2 }, [null]), TypeError);
});

test("a detector returning null or undefined is treated as no events, not an error", () => {
  const events = deriveEvents(
    { x: 1 },
    { x: 2 },
    [() => null, () => undefined, () => [{ type: "example.a" }]],
    exampleProvenance,
  );
  assert.deepEqual(events.map((e) => e.type), ["example.a"]);
});
