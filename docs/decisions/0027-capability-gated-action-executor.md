# ADR 0027: Capability-Gated Action Executor

- **Status:** Accepted for the P04-T002 vertical slice
- **Date:** 2026-08-09

## Context

P04-T001 proved `semantic event -> declarative rule -> validated action request`, deliberately stopping at a descriptive, non-executable envelope: "no action executor, provider capability checks, emulator writes... or external integration." Its own recommended follow-up was to "define a capability-gated action-provider boundary and a minimal in-memory executor for approved local actions" while keeping "provider mutation and permissions outside rule evaluation."

The platform needs to prove that an action request can be turned into a real (but harmless) local effect without collapsing the separation between deciding what should happen (rules) and doing it (execution), and without assuming every future action is safe to run just because a rule asked for it.

## Decision

A new `src/actions/execute.js` module adds a fourth, wholly separate pipeline stage: `createActionExecutor(providers, options)` builds an executor bound at construction time to a fixed set of registered action providers and a fixed set of granted capability strings. `src/rules/evaluate.js` is not modified and does not import this module; the executor consumes the `ActionRequest` envelopes that stage already produces and validates, and never calls back into rule evaluation.

An action provider is a plain descriptor: `actionType`, a `requiredCapability` string (deliberately independent of `actionType`, so a future provider can gate on a stronger capability than its own name), `validatePayload(payload)`, an optional `authorize(payload, context)`, and `execute(payload, context)`.

Execution is a fixed pipeline, each stage failing closed with a specific structured code before any side effect can occur: request schema validity, provider registration (`UNSUPPORTED_ACTION_TYPE`), capability grant (`MISSING_CAPABILITY`), per-request authorization (`UNAUTHORIZED_ACTION`), payload validity (`INVALID_PAYLOAD`), then execution itself, with any provider exception caught and returned as `EXECUTION_FAILED` rather than thrown. `execute()`/`executeAll()` never throw for request-shaped input; every outcome - including a malformed request - is a schema-validated `ActionResult` (`src/actions/schemas/action-result.schema.json`).

Replay/duplicate handling is explicit: requests are keyed by `${correlationId}:${sequence}` (documented as unique within one evaluation run by the existing action-request schema). An identical replay of an already-executed request returns the original cached result with status `duplicate` and does not invoke the provider a second time. A different request that happens to reuse the same key is never conflated with the cached result - it is evaluated fresh on its own merits, since silently returning a stale result for a different action would be a correctness/security bug, not a convenience.

Two harmless local providers prove the architecture: `overlay.notification` (capability `overlay.notify`) and `system.log` (capability `system.log`), each delivering to an injected sink defaulting to a console line - no real I/O, network, emulator, or file access by default.

## Consequences

- Capability grants and provider registration are executor-construction-time decisions (e.g. one session's configuration), not something a rule or an action request can widen at execution time.
- A future, more dangerous action (memory writes, input injection, savestate control) plugs into the same four-stage pipeline by declaring its own `requiredCapability` and `authorize()` logic - the rule engine and the executor framework require no changes to represent it. Whether that capability is ever granted, and under what authorization, remains a decision for whoever constructs that future executor, not this contract.
- In-memory replay tracking is scoped to one executor instance's lifetime and is not bounded/expired - acceptable for this proof; a future task should address long-running-session growth if this executor becomes long-lived.
- This does not implement memory writes, input injection, savestate operations, webhooks, Discord/Twitch/OBS integrations, scripting, multiplayer, or provider-specific emulator actions. Those remain separate, later decisions requiring their own capability/authorization design.
