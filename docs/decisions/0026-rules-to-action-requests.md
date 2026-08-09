# ADR 0026: Declarative Rules Produce Action Requests

- **Status:** Accepted for the P04-T001 vertical slice
- **Date:** 2026-08-09

## Context

P03 provides validated, provider-neutral semantic event envelopes. The next platform boundary needs to prove that an event can select declarative behavior without allowing a rule to call an emulator, domain implementation, or external system directly.

## Decision

EOE rules consume one validated semantic event and emit validated action-request envelopes. Rule definitions contain a stable ID, enabled flag, event-type match, a bounded list of JSON-Pointer predicates, and ordered action declarations. The initial evaluator supports `equals`, `notEquals`, `exists`, `notExists`, `greaterThan`, and `lessThan`.

The first harmless request type is `overlay.notification`. It is a description of a requested effect, not an executor. `notEquals` requires the referenced value to exist; missing values are handled explicitly with `exists`/`notExists`.

Action requests retain request sequence, correlation ID, originating rule ID, the validated triggering event, and an object payload. The evaluator preserves rule/action declaration order and validates every output before returning it.

## Consequences

The rules layer remains domain-neutral: Pokemon-specific event names may appear in configuration and tests, but not in the evaluator or action contract. Emulator/provider mutation, capability checks, permissions, transport, and side-effect execution remain deferred to a separate P04 task. The current contract is intentionally small and does not define an event bus, arbitrary expression language, scripting runtime, or action-provider registry.

Rules are data, not executable code. Predicate paths are resolved as safe own-property JSON Pointers, with prototype-sensitive names rejected. Unsupported action types fail closed rather than being passed to an unknown executor.
