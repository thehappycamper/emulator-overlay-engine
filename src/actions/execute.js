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
  INTERNAL_ERROR: "INTERNAL_ERROR",
});

// Safely describes a thrown value that is not guaranteed to be an Error -
// providers, validatePayload(), and authorize() are caller-supplied and may
// throw null/undefined/a string/a plain object instead of an Error. Never
// reads `.message` on an untrusted value without first confirming it is
// actually an Error.
function describeThrown(value) {
  if (value instanceof Error) return value.message || value.stack || value.name || "Error";
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? json : String(value);
  } catch {
    return String(value);
  }
}

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

// Replay identity policy (ADR 0027 addendum, fix round): a
// `correlationId:sequence` pair alone only identifies a request's declared
// *position* within one evaluation run, not its *content*. Two requests
// that legitimately differ - a different rule, a different triggering
// event, or a different payload - must never be conflated into the same
// replay identity just because a caller (a caller bug, a rebuilt/replayed
// event stream, or a hand-constructed request) happens to reuse that pair.
//
// The chosen policy is a full canonical fingerprint: the replay identity is
// a deterministic, object-key-order-independent serialization of every
// field relevant to "is this semantically the same request" -
// `actionType`, `correlationId`, `sequence`, `ruleId`, `triggeringEvent`,
// and `payload`. Two requests share a replay identity if and only if all
// six match exactly. Anything else - even one sharing a
// `correlationId:sequence` pair - is evaluated as an independent request on
// its own merits; it is never spuriously merged with, or rejected against,
// an unrelated cached/in-flight outcome.
function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function computeReplayIdentity(request) {
  return canonicalStringify({
    actionType: request.actionType,
    correlationId: request.correlationId,
    sequence: request.sequence,
    ruleId: request.ruleId,
    triggeringEvent: request.triggeringEvent,
    payload: request.payload,
  });
}

function isPlainObjectOrNull(value) {
  return value === null || (typeof value === "object" && !Array.isArray(value));
}

// Builds a schema-validated ActionResult. If the requested shape somehow
// fails its own schema (a defense-in-depth backstop - every known way this
// could happen is already guarded before this is called), this converts
// that into a structured INTERNAL_ERROR failure instead of letting
// ActionResultValidationError escape execute()/executeAll(); execute() must
// never throw for request-shaped input.
function buildResult(request, status, code, message, { result = null, details = null } = {}) {
  const built = {
    status,
    code: typeof code === "string" && code ? code : ACTION_EXECUTION_CODES.INTERNAL_ERROR,
    message: typeof message === "string" ? message : describeThrown(message),
    actionType: typeof request?.actionType === "string" ? request.actionType : null,
    sequence: Number.isInteger(request?.sequence) ? request.sequence : null,
    correlationId: typeof request?.correlationId === "string" ? request.correlationId : null,
    ruleId: typeof request?.ruleId === "string" ? request.ruleId : null,
    result: isPlainObjectOrNull(result) ? result : null,
    details: isPlainObjectOrNull(details) ? details : { value: describeThrown(details) },
  };
  try {
    assertValidActionResult(built);
    return Object.freeze(built);
  } catch (validationError) {
    return Object.freeze({
      status: "failed",
      code: ACTION_EXECUTION_CODES.INTERNAL_ERROR,
      message: `Executor produced an invalid internal result and converted it to a structured failure: ${validationError.message}`,
      actionType: built.actionType,
      sequence: built.sequence,
      correlationId: built.correlationId,
      ruleId: built.ruleId,
      result: null,
      details: null,
    });
  }
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
  // createEventSequencer). A new executor starts with no replay history,
  // and nothing here is persisted or shared across executor instances or
  // process restarts. `executed` grows for the life of the executor and is
  // never pruned or bounded; a future long-running-session task should
  // consider expiring old entries, which this proof does not need.
  const executed = new Map();

  // Single-flight guard: while a replay identity's pipeline is in progress,
  // concurrent identical requests await this same promise instead of each
  // independently observing an empty `executed` cache and invoking the
  // provider a second (or third...) time. Always cleared in a `finally`, so
  // a failed/rejected in-flight execution can never deadlock or
  // permanently poison the key - a later identical request simply starts a
  // fresh attempt.
  const inFlight = new Map();

  // Runs the actual fail-closed pipeline (provider lookup through
  // execution) for one already-deduplicated replay identity. Only ever
  // invoked once per identity while its promise is registered in
  // `inFlight` - concurrent callers for the same identity await that
  // promise instead of calling this again.
  async function runPipeline(validRequest, context, key) {
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
        const reason = describeThrown(error);
        return buildResult(
          validRequest,
          "rejected",
          ACTION_EXECUTION_CODES.UNAUTHORIZED_ACTION,
          `Authorization check for "${validRequest.actionType}" threw: ${reason}`,
          { details: { error: reason } },
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
      const reason = describeThrown(error);
      return buildResult(validRequest, "rejected", ACTION_EXECUTION_CODES.INVALID_PAYLOAD, reason, { details: { error: reason } });
    }

    let executionResult;
    try {
      const raw = await provider.execute(validRequest.payload, mergedContext);
      executionResult = raw ?? {};
    } catch (error) {
      const reason = describeThrown(error);
      return buildResult(
        validRequest,
        "failed",
        ACTION_EXECUTION_CODES.EXECUTION_FAILED,
        `"${validRequest.actionType}" execution threw: ${reason}`,
        { details: { error: reason } },
      );
    }

    // Contain a provider that returns something other than a plain object
    // (a string, a number, an array, ...) - the result schema requires
    // `result` to be an object or null, and silently accepting a malformed
    // value here would either corrupt the published ActionResult or force
    // buildResult()'s own backstop to swallow a perfectly diagnosable error.
    if (typeof executionResult !== "object" || Array.isArray(executionResult)) {
      return buildResult(
        validRequest,
        "failed",
        ACTION_EXECUTION_CODES.EXECUTION_FAILED,
        `"${validRequest.actionType}" execution returned a malformed result (expected an object)`,
        { details: { error: `Provider returned ${describeThrown(executionResult)}` } },
      );
    }

    const successResult = buildResult(
      validRequest,
      "executed",
      ACTION_EXECUTION_CODES.OK,
      `Executed "${validRequest.actionType}"`,
      { result: executionResult },
    );
    // Only ever cache a genuine success - a rejected/failed outcome
    // (including buildResult()'s own INTERNAL_ERROR backstop) is never
    // cached, so the replay identity is never permanently poisoned by a
    // failure and a later identical request can always retry.
    if (successResult.status === "executed") {
      executed.set(key, { request: validRequest, result: successResult });
    }
    return successResult;
  }

  async function execute(request, context = {}) {
    let validRequest;
    try {
      assertValidActionRequest(request);
      validRequest = request;
    } catch (error) {
      return buildResult(request, "rejected", ACTION_EXECUTION_CODES.INVALID_REQUEST, describeThrown(error));
    }

    const key = computeReplayIdentity(validRequest);

    const cached = executed.get(key);
    if (cached) {
      // A genuine, already-completed replay: return the original outcome
      // without invoking the provider a second time.
      return buildResult(
        validRequest,
        "duplicate",
        ACTION_EXECUTION_CODES.DUPLICATE,
        "An identical action request was already executed; it was not re-executed.",
        { result: cached.result.result },
      );
    }

    const inFlightPromise = inFlight.get(key);
    if (inFlightPromise) {
      // A concurrent identical request is already mid-pipeline for this
      // exact replay identity - wait for it instead of racing it. Neither
      // caller can observe an empty cache and independently invoke the
      // provider, which is what guarantees exactly one invocation.
      const primaryResult = await inFlightPromise;
      if (primaryResult.status !== "executed") {
        // The in-flight attempt did not succeed. This caller did not cause
        // a second invocation, and the key is not poisoned by that
        // outcome - a subsequent call (concurrent or sequential) is free
        // to start a fresh attempt. Share the same non-success outcome
        // rather than triggering a redundant, guaranteed-identical retry.
        return primaryResult;
      }
      return buildResult(
        validRequest,
        "duplicate",
        ACTION_EXECUTION_CODES.DUPLICATE,
        "An identical action request was already executed concurrently; it was not re-executed.",
        { result: primaryResult.result },
      );
    }

    // Reserve the replay identity in `inFlight` *before* any part of the
    // pipeline runs - including a synchronous re-entrant call. Calling
    // runPipeline(...) directly here would start executing its synchronous
    // prefix (provider lookup, capability check, and - whenever the
    // provider has no authorize() hook, or authorize()/validatePayload()/
    // execute() do no awaiting of their own before calling back out - the
    // provider's own validatePayload()/execute()) immediately, before this
    // function's very next line (`inFlight.set(...)`) ever gets to run. A
    // provider that synchronously calls executor.execute() again with the
    // same request would then still observe an empty `inFlight` entry and
    // start a second, independent pipeline run, defeating single-flight
    // even though ordinary asynchronous concurrency is already handled.
    //
    // Deferring the actual runPipeline() call to a microtask (queued via
    // Promise.resolve().then(...)) closes that gap: everything up to and
    // including `inFlight.set(key, pipelinePromise)` below completes
    // synchronously, in this call's own synchronous execution window,
    // before the queued microtask - and therefore before any part of
    // runPipeline(), including a synchronously re-entrant provider - ever
    // runs. Any re-entrant or concurrent execute() call for the same key,
    // no matter how it arrives, is guaranteed to find the reservation
    // already in place.
    const pipelinePromise = Promise.resolve().then(() => runPipeline(validRequest, context, key));
    inFlight.set(key, pipelinePromise);
    try {
      return await pipelinePromise;
    } finally {
      inFlight.delete(key);
    }
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
