// Capability-gated action executor (P04-T002 / ADR 0027). This is the
// third stage of the platform pipeline established by P03/P04-T001:
//
//   semantic event -> declarative rule -> validated action request -> executor
//
// src/rules/evaluate.js (the previous stage) never imports this module and
// never calls it - rule evaluation stays completely side-effect-free. This
// module is a wholly separate consumer of the ActionRequest envelopes that
// stage already produces and validates; it never reaches back into rule
// evaluation.
//
// An "action provider" is a plain descriptor registered with the executor,
// not the rules layer:
//   {
//     actionType: string,               // matches ActionRequest.actionType
//     requiredCapability: string,       // capability the executor must be
//                                       // granted for this provider to run;
//                                       // deliberately not required to equal
//                                       // actionType, so a future provider
//                                       // (e.g. an emulator-write action)
//                                       // can gate on a much stronger
//                                       // capability than its own name.
//     validatePayload(payload),         // throws on an invalid payload
//     authorize(payload, context)?,     // optional; falsy/throw -> unauthorized
//     execute(payload, context),        // may be async; may throw
//   }
//
// The executor never throws from execute()/executeAll() for any
// request-shaped input - every outcome (including a malformed request, an
// unsupported type, a missing capability, a failed authorization check, an
// invalid payload, or a provider exception) is returned as a structured
// ActionResult (src/actions/schemas/action-result.schema.json). This is
// what "fails closed" and "executor exceptions are returned as structured
// failures rather than crashing rule evaluation" mean concretely here: a
// caller executing many requests in a loop is never crashed by one of them.

import { assertValidActionRequest, assertValidActionResult } from "./validate.js";

export const ACTION_EXECUTION_CODES = Object.freeze({
  OK: "OK",
  DUPLICATE: "DUPLICATE",
  UNSUPPORTED_ACTION_TYPE: "UNSUPPORTED_ACTION_TYPE",
  MISSING_CAPABILITY: "MISSING_CAPABILITY",
  UNAUTHORIZED_ACTION: "UNAUTHORIZED_ACTION",
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  EXECUTION_FAILED: "EXECUTION_FAILED",
});

function assertProvider(provider) {
  if (!provider || typeof provider !== "object") throw new TypeError("Action provider must be an object");
  if (typeof provider.actionType !== "string" || !provider.actionType) {
    throw new TypeError("Action provider requires a non-empty string actionType");
  }
  if (typeof provider.requiredCapability !== "string" || !provider.requiredCapability) {
    throw new TypeError(`Action provider "${provider.actionType}" requires a non-empty string requiredCapability`);
  }
  if (typeof provider.validatePayload !== "function") {
    throw new TypeError(`Action provider "${provider.actionType}" requires a validatePayload function`);
  }
  if (typeof provider.execute !== "function") {
    throw new TypeError(`Action provider "${provider.actionType}" requires an execute function`);
  }
  if (provider.authorize !== undefined && typeof provider.authorize !== "function") {
    throw new TypeError(`Action provider "${provider.actionType}" authorize must be a function when present`);
  }
}

// The chosen idempotency key for replay/duplicate detection: `sequence` is
// documented (action-request.schema.json) as unique within one
// correlationId's evaluation run, so this pair is the smallest honest
// identity for "the same action request" without inventing a new field.
function requestKey(request) {
  return `${request.correlationId}:${request.sequence}`;
}

function buildResult(request, status, code, message, { result = null, details = null } = {}) {
  const built = {
    status,
    code,
    message,
    actionType: request?.actionType ?? null,
    sequence: request?.sequence ?? null,
    correlationId: request?.correlationId ?? null,
    ruleId: request?.ruleId ?? null,
    result,
    details,
  };
  assertValidActionResult(built);
  return Object.freeze(built);
}

// Creates a capability-gated executor bound to a fixed set of registered
// providers and a fixed set of granted capabilities. Both providers and
// capabilities are decided at construction time (representing, e.g., one
// session's configuration) - execution never widens either.
export function createActionExecutor(providers, { grantedCapabilities = [], defaultContext = {} } = {}) {
  if (!Array.isArray(providers)) throw new TypeError("providers must be an array");
  const registry = new Map();
  for (const provider of providers) {
    assertProvider(provider);
    if (registry.has(provider.actionType)) throw new TypeError(`Duplicate action provider registered for "${provider.actionType}"`);
    registry.set(provider.actionType, Object.freeze({ ...provider }));
  }
  const capabilities = new Set(grantedCapabilities);

  // In-memory only, scoped to this executor instance's lifetime - matches
  // this project's existing session-scoped-state convention (e.g.
  // createEventSequencer). Grows for the life of the executor; a future
  // task should consider bounding/expiring this store for a long-running
  // session, which this proof does not need.
  const executed = new Map();

  async function execute(request, context = {}) {
    let validRequest;
    try {
      assertValidActionRequest(request);
      validRequest = request;
    } catch (error) {
      return buildResult(request, "rejected", ACTION_EXECUTION_CODES.INVALID_REQUEST, error.message);
    }

    const key = requestKey(validRequest);
    const previous = executed.get(key);
    if (previous) {
      const isReplayOfSameRequest =
        previous.request.actionType === validRequest.actionType &&
        JSON.stringify(previous.request.payload) === JSON.stringify(validRequest.payload);
      if (isReplayOfSameRequest) {
        // A genuine replay: return the original outcome without invoking
        // the provider a second time. This is the explicit duplicate
        // policy - re-delivery of the same (correlationId, sequence) pair
        // with the same content never re-runs a side effect.
        return buildResult(
          validRequest,
          "duplicate",
          ACTION_EXECUTION_CODES.DUPLICATE,
          "An identical action request was already executed; it was not re-executed.",
          { result: previous.result.result },
        );
      }
      // Same (correlationId, sequence) key but a genuinely different
      // request (a caller bug or a colliding key) - never conflate this
      // with the cached result. It falls through and is evaluated fresh
      // on its own merits below, exactly like a first-time request.
    }

    const provider = registry.get(validRequest.actionType);
    if (!provider) {
      return buildResult(
        validRequest,
        "rejected",
        ACTION_EXECUTION_CODES.UNSUPPORTED_ACTION_TYPE,
        `No action provider is registered for "${validRequest.actionType}"`,
      );
    }

    if (!capabilities.has(provider.requiredCapability)) {
      return buildResult(
        validRequest,
        "rejected",
        ACTION_EXECUTION_CODES.MISSING_CAPABILITY,
        `This executor was not granted the "${provider.requiredCapability}" capability required by "${validRequest.actionType}"`,
      );
    }

    const mergedContext = { ...defaultContext, ...context };

    if (provider.authorize) {
      let authorized;
      try {
        authorized = await provider.authorize(validRequest.payload, mergedContext);
      } catch (error) {
        return buildResult(
          validRequest,
          "rejected",
          ACTION_EXECUTION_CODES.UNAUTHORIZED_ACTION,
          `Authorization check for "${validRequest.actionType}" threw: ${error.message}`,
          { details: { error: error.message } },
        );
      }
      if (!authorized) {
        return buildResult(
          validRequest,
          "rejected",
          ACTION_EXECUTION_CODES.UNAUTHORIZED_ACTION,
          `Not authorized to execute "${validRequest.actionType}" in this context`,
        );
      }
    }

    try {
      provider.validatePayload(validRequest.payload);
    } catch (error) {
      return buildResult(
        validRequest,
        "rejected",
        ACTION_EXECUTION_CODES.INVALID_PAYLOAD,
        error.message,
        { details: { error: error.message } },
      );
    }

    let executionResult;
    try {
      executionResult = (await provider.execute(validRequest.payload, mergedContext)) ?? {};
    } catch (error) {
      return buildResult(
        validRequest,
        "failed",
        ACTION_EXECUTION_CODES.EXECUTION_FAILED,
        `"${validRequest.actionType}" execution threw: ${error.message}`,
        { details: { error: error.message } },
      );
    }

    const successResult = buildResult(
      validRequest,
      "executed",
      ACTION_EXECUTION_CODES.OK,
      `Executed "${validRequest.actionType}"`,
      { result: executionResult },
    );
    executed.set(key, { request: validRequest, result: successResult });
    return successResult;
  }

  // Executes a batch of requests strictly in array order (never
  // concurrently) - action ordering stays deterministic and matches the
  // order evaluateRules() itself already assigns via `sequence`.
  async function executeAll(requests, context = {}) {
    if (!Array.isArray(requests)) throw new TypeError("requests must be an array");
    const results = [];
    for (const request of requests) {
      results.push(await execute(request, context));
    }
    return results;
  }

  return Object.freeze({
    supportedActionTypes: () => [...registry.keys()],
    grantedCapabilities: () => [...capabilities],
    execute,
    executeAll,
  });
}
