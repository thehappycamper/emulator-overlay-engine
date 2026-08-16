import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ACTION_EXECUTION_CODES, createActionExecutor } from "../src/actions/execute.js";
import { assertValidActionResult, ActionResultValidationError } from "../src/actions/validate.js";
import { HARMLESS_LOCAL_PROVIDERS, overlayNotificationProvider, systemLogProvider } from "../src/actions/providers/index.js";
import { evaluateRules } from "../src/rules/evaluate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function event(overrides = {}) {
  return {
    type: "pokemon.fainted",
    sequence: 7,
    detectedAt: "2026-08-09T00:00:00.000Z",
    subject: { kind: "party", slot: 0 },
    previous: { currentHp: 4 },
    current: { currentHp: 0 },
    provenance: { domain: "pokemon", detector: "pokemon.fainted" },
    ...overrides,
  };
}

function rule(overrides = {}) {
  return {
    id: "notify-faint",
    enabled: true,
    eventType: "pokemon.fainted",
    predicates: [],
    actions: [{ actionType: "overlay.notification", payload: { message: "A Pokemon fainted" } }],
    ...overrides,
  };
}

function actionRequest(overrides = {}) {
  const [request] = evaluateRules(event(), [rule()], { correlationId: "run:1" });
  return { ...request, ...overrides };
}

function harmlessExecutor(options = {}) {
  return createActionExecutor(HARMLESS_LOCAL_PROVIDERS, {
    grantedCapabilities: ["overlay.notify", "system.log"],
    ...options,
  });
}

test("a supported, authorized, valid action executes and produces a schema-valid result", async () => {
  const executor = harmlessExecutor();
  const notified = [];
  const request = actionRequest();
  const result = await executor.execute(request, { sessionAuthorized: true, notify: (m) => notified.push(m) });
  assert.equal(result.status, "executed");
  assert.equal(result.code, ACTION_EXECUTION_CODES.OK);
  assert.deepEqual(result.result, { delivered: true, message: "A Pokemon fainted" });
  assert.deepEqual(notified, ["A Pokemon fainted"]);
  assert.equal(assertValidActionResult(result), true);
});

test("an unsupported action type fails closed without executing anything", async () => {
  const executor = harmlessExecutor();
  const request = actionRequest({ actionType: "provider.write", payload: {} });
  const result = await executor.execute(request, { sessionAuthorized: true });
  assert.equal(result.status, "rejected");
  assert.equal(result.code, ACTION_EXECUTION_CODES.UNSUPPORTED_ACTION_TYPE);
  assert.equal(result.result, null);
});

test("a registered provider whose required capability was never granted fails closed", async () => {
  const executor = createActionExecutor(HARMLESS_LOCAL_PROVIDERS, { grantedCapabilities: ["system.log"] }); // overlay.notify withheld
  const request = actionRequest();
  const result = await executor.execute(request, { sessionAuthorized: true });
  assert.equal(result.status, "rejected");
  assert.equal(result.code, ACTION_EXECUTION_CODES.MISSING_CAPABILITY);
});

test("an unauthorized action (capability granted, authorize() denies) fails closed", async () => {
  const executor = harmlessExecutor();
  const request = actionRequest();
  const result = await executor.execute(request, {}); // no sessionAuthorized flag
  assert.equal(result.status, "rejected");
  assert.equal(result.code, ACTION_EXECUTION_CODES.UNAUTHORIZED_ACTION);
});

test("an authorize() hook that throws is treated as an authorization failure, not a crash", async () => {
  const throwingProvider = {
    actionType: "overlay.notification",
    requiredCapability: "overlay.notify",
    validatePayload() {},
    authorize() { throw new Error("authz backend unavailable"); },
    execute() { return { delivered: true }; },
  };
  const executor = createActionExecutor([throwingProvider], { grantedCapabilities: ["overlay.notify"] });
  const result = await executor.execute(actionRequest(), { sessionAuthorized: true });
  assert.equal(result.status, "rejected");
  assert.equal(result.code, ACTION_EXECUTION_CODES.UNAUTHORIZED_ACTION);
  assert.match(result.details.error, /authz backend unavailable/);
});

test("a malformed payload fails closed with details, for both harmless providers", async () => {
  const executor = harmlessExecutor();
  const missingMessage = await executor.execute(actionRequest({ payload: {} }), { sessionAuthorized: true });
  assert.equal(missingMessage.status, "rejected");
  assert.equal(missingMessage.code, ACTION_EXECUTION_CODES.INVALID_PAYLOAD);
  assert.ok(missingMessage.details?.error);

  const wrongType = await executor.execute(actionRequest({ payload: { message: 42 } }), { sessionAuthorized: true });
  assert.equal(wrongType.status, "rejected");
  assert.equal(wrongType.code, ACTION_EXECUTION_CODES.INVALID_PAYLOAD);

  const badLevel = await executor.execute(
    actionRequest({ actionType: "system.log", payload: { level: "verbose", message: "hi" } }),
    { sessionAuthorized: true },
  );
  assert.equal(badLevel.status, "rejected");
  assert.equal(badLevel.code, ACTION_EXECUTION_CODES.INVALID_PAYLOAD);
});

test("a genuinely malformed action request (not just payload) fails closed as INVALID_REQUEST", async () => {
  const executor = harmlessExecutor();
  for (const malformed of [null, undefined, "not-an-object", {}, { actionType: "overlay.notification" }]) {
    const result = await executor.execute(malformed, { sessionAuthorized: true });
    assert.equal(result.status, "rejected");
    assert.equal(result.code, ACTION_EXECUTION_CODES.INVALID_REQUEST);
    assert.equal(assertValidActionResult(result), true);
  }
});

test("a provider execute() exception is returned as a structured failure, not thrown", async () => {
  const crashingProvider = {
    actionType: "overlay.notification",
    requiredCapability: "overlay.notify",
    validatePayload() {},
    authorize: () => true,
    execute() { throw new Error("boom"); },
  };
  const executor = createActionExecutor([crashingProvider], { grantedCapabilities: ["overlay.notify"] });
  const result = await executor.execute(actionRequest(), {});
  assert.equal(result.status, "failed");
  assert.equal(result.code, ACTION_EXECUTION_CODES.EXECUTION_FAILED);
  assert.match(result.details.error, /boom/);
});

test("an async provider execute() rejection is also returned as a structured failure", async () => {
  const asyncCrashingProvider = {
    actionType: "overlay.notification",
    requiredCapability: "overlay.notify",
    validatePayload() {},
    authorize: () => true,
    async execute() { throw new Error("async boom"); },
  };
  const executor = createActionExecutor([asyncCrashingProvider], { grantedCapabilities: ["overlay.notify"] });
  const result = await executor.execute(actionRequest(), {});
  assert.equal(result.status, "failed");
  assert.match(result.details.error, /async boom/);
});

test("action ordering is deterministic: executeAll processes requests strictly in array order", async () => {
  const order = [];
  const trackingProvider = {
    actionType: "overlay.notification",
    requiredCapability: "overlay.notify",
    validatePayload() {},
    authorize: () => true,
    async execute(payload) {
      order.push(`start:${payload.message}`);
      await new Promise((r) => setTimeout(r, payload.message === "slow" ? 20 : 0));
      order.push(`end:${payload.message}`);
      return { delivered: true };
    },
  };
  const executor = createActionExecutor([trackingProvider], { grantedCapabilities: ["overlay.notify"] });
  const requests = evaluateRules(event(), [
    rule({
      id: "batch",
      actions: [
        { actionType: "overlay.notification", payload: { message: "slow" } },
        { actionType: "overlay.notification", payload: { message: "fast-a" } },
        { actionType: "overlay.notification", payload: { message: "fast-b" } },
      ],
    }),
  ], { correlationId: "batch:1" });

  const results = await executor.executeAll(requests, {});
  assert.equal(results.every((r) => r.status === "executed"), true);
  // Strictly sequential: "slow" must fully start-and-end before "fast-a"
  // even starts, proving executeAll never runs requests concurrently.
  assert.deepEqual(order, ["start:slow", "end:slow", "start:fast-a", "end:fast-a", "start:fast-b", "end:fast-b"]);
});

test("duplicate/replayed action handling: an identical replay is not re-executed, a colliding-but-different request is", async () => {
  const calls = [];
  const countingProvider = {
    actionType: "overlay.notification",
    requiredCapability: "overlay.notify",
    validatePayload() {},
    authorize: () => true,
    execute(payload) { calls.push(payload.message); return { delivered: true, message: payload.message }; },
  };
  const executor = createActionExecutor([countingProvider], { grantedCapabilities: ["overlay.notify"] });
  const request = actionRequest();

  const first = await executor.execute(request, {});
  const replay = await executor.execute(request, {});
  assert.equal(first.status, "executed");
  assert.equal(replay.status, "duplicate");
  assert.equal(replay.code, ACTION_EXECUTION_CODES.DUPLICATE);
  assert.deepEqual(replay.result, first.result);
  assert.deepEqual(calls, ["A Pokemon fainted"], "the provider must be invoked exactly once for a true replay");

  // Same correlationId+sequence key, but a genuinely different payload -
  // must not be silently conflated with the cached result.
  const collidingButDifferent = { ...request, payload: { message: "different message" } };
  const third = await executor.execute(collidingButDifferent, {});
  assert.equal(third.status, "executed");
  assert.deepEqual(calls, ["A Pokemon fainted", "different message"]);
});

test("concurrent identical action requests single-flight: exactly one provider invocation occurs", async () => {
  let calls = 0;
  let resolveExecute;
  const gatedProvider = {
    actionType: "overlay.notification",
    requiredCapability: "overlay.notify",
    validatePayload() {},
    authorize: () => true,
    async execute(payload) {
      calls += 1;
      await new Promise((resolve) => { resolveExecute = resolve; });
      return { delivered: true, message: payload.message };
    },
  };
  const executor = createActionExecutor([gatedProvider], { grantedCapabilities: ["overlay.notify"] });
  const request = actionRequest();

  const firstPromise = executor.execute(request, {});
  const secondPromise = executor.execute(request, {});
  // Let both calls' synchronous prefixes (including single-flight
  // registration) and the pending microtasks up to provider.execute() run
  // before releasing the gate.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1, "the second concurrent call must not have invoked the provider before the first completed");
  resolveExecute();

  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(calls, 1, "the provider must be invoked exactly once for two concurrent identical requests");
  assert.equal(first.status, "executed");
  assert.equal(second.status, "duplicate");
  assert.equal(second.code, ACTION_EXECUTION_CODES.DUPLICATE);
  assert.deepEqual(second.result, first.result);
  assert.equal(assertValidActionResult(first), true);
  assert.equal(assertValidActionResult(second), true);
});

test("concurrent identical requests do not deadlock when the in-flight execution fails, and the key is not poisoned afterward", async () => {
  let calls = 0;
  let rejectExecute;
  const flakyProvider = {
    actionType: "overlay.notification",
    requiredCapability: "overlay.notify",
    validatePayload() {},
    authorize: () => true,
    async execute() {
      calls += 1;
      if (calls === 1) {
        await new Promise((_resolve, reject) => { rejectExecute = reject; });
      }
      return { delivered: true };
    },
  };
  const executor = createActionExecutor([flakyProvider], { grantedCapabilities: ["overlay.notify"] });
  const request = actionRequest();

  const firstPromise = executor.execute(request, {});
  const secondPromise = executor.execute(request, {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  rejectExecute(new Error("boom"));

  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(calls, 1, "only the single in-flight attempt may invoke the provider");
  assert.equal(first.status, "failed");
  assert.equal(second.status, "failed");
  assert.equal(second.code, ACTION_EXECUTION_CODES.EXECUTION_FAILED);
  assert.equal(assertValidActionResult(first), true);
  assert.equal(assertValidActionResult(second), true);

  // The key must be free again immediately afterward - not deadlocked, not
  // permanently poisoned by the earlier failure.
  const retry = await executor.execute(request, {});
  assert.equal(retry.status, "executed");
  assert.equal(calls, 2);
});

test("a failed execution does not poison the replay key: an identical retry after a failure can still execute", async () => {
  let shouldFail = true;
  const flakyProvider = {
    actionType: "overlay.notification",
    requiredCapability: "overlay.notify",
    validatePayload() {},
    authorize: () => true,
    execute() {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("transient");
      }
      return { delivered: true };
    },
  };
  const executor = createActionExecutor([flakyProvider], { grantedCapabilities: ["overlay.notify"] });
  const request = actionRequest();

  const failedAttempt = await executor.execute(request, {});
  assert.equal(failedAttempt.status, "failed");

  const retry = await executor.execute(request, {});
  assert.equal(retry.status, "executed", "the replay key must not be permanently poisoned by a prior failure");
});

test("replay identity is strengthened: same correlationId+sequence but a different ruleId/triggeringEvent/actionType/payload is never conflated as a duplicate", async () => {
  const calls = [];
  const makeProvider = (actionType) => ({
    actionType,
    requiredCapability: "test.capability",
    validatePayload() {},
    authorize: () => true,
    execute(payload) { calls.push([actionType, payload]); return { ok: true }; },
  });
  const executor = createActionExecutor([makeProvider("test.a"), makeProvider("test.b")], { grantedCapabilities: ["test.capability"] });

  const base = actionRequest({ actionType: "test.a", payload: { n: 1 } });

  const first = await executor.execute(base, {});
  assert.equal(first.status, "executed");

  const differentPayload = { ...base, payload: { n: 2 } };
  const secondByPayload = await executor.execute(differentPayload, {});
  assert.equal(secondByPayload.status, "executed");

  const differentRule = { ...base, ruleId: "a-different-rule" };
  const secondByRule = await executor.execute(differentRule, {});
  assert.equal(secondByRule.status, "executed");

  const differentEvent = { ...base, triggeringEvent: { ...base.triggeringEvent, detectedAt: "2026-08-09T00:00:01.000Z" } };
  const secondByEvent = await executor.execute(differentEvent, {});
  assert.equal(secondByEvent.status, "executed");

  const differentType = { ...base, actionType: "test.b" };
  const secondByType = await executor.execute(differentType, {});
  assert.equal(secondByType.status, "executed");

  // A genuine replay of the ORIGINAL request (every field identical) is
  // still correctly deduplicated.
  const replay = await executor.execute(base, {});
  assert.equal(replay.status, "duplicate");

  assert.equal(calls.length, 5, "every semantically distinct request variant must invoke the provider exactly once, and none of them a second time");
});

test("a provider returning a non-object value is contained as a structured failure, not propagated", async () => {
  for (const malformed of ["not-an-object", 42, true, ["array", "result"]]) {
    const provider = {
      actionType: "overlay.notification",
      requiredCapability: "overlay.notify",
      validatePayload() {},
      authorize: () => true,
      execute() { return malformed; },
    };
    const executor = createActionExecutor([provider], { grantedCapabilities: ["overlay.notify"] });
    const result = await executor.execute(actionRequest(), {});
    assert.equal(result.status, "failed");
    assert.equal(result.code, ACTION_EXECUTION_CODES.EXECUTION_FAILED);
    assert.equal(assertValidActionResult(result), true);
  }
});

test("provider/validator/authorize throwing non-Error values (null, undefined, string, number, plain object) never crashes execute() and always yields a schema-valid result", async () => {
  const nonErrorValues = [null, undefined, "plain string reason", 42, { custom: "shape" }];

  for (const thrown of nonErrorValues) {
    const provider = {
      actionType: "overlay.notification",
      requiredCapability: "overlay.notify",
      validatePayload() {},
      authorize: () => true,
      execute() { throw thrown; },
    };
    const executor = createActionExecutor([provider], { grantedCapabilities: ["overlay.notify"] });
    const result = await executor.execute(actionRequest(), {});
    assert.equal(result.status, "failed");
    assert.equal(result.code, ACTION_EXECUTION_CODES.EXECUTION_FAILED);
    assert.equal(assertValidActionResult(result), true);
  }

  for (const thrown of nonErrorValues) {
    const provider = {
      actionType: "overlay.notification",
      requiredCapability: "overlay.notify",
      validatePayload() { throw thrown; },
      authorize: () => true,
      execute() { return {}; },
    };
    const executor = createActionExecutor([provider], { grantedCapabilities: ["overlay.notify"] });
    const result = await executor.execute(actionRequest(), {});
    assert.equal(result.status, "rejected");
    assert.equal(result.code, ACTION_EXECUTION_CODES.INVALID_PAYLOAD);
    assert.equal(assertValidActionResult(result), true);
  }

  for (const thrown of nonErrorValues) {
    const provider = {
      actionType: "overlay.notification",
      requiredCapability: "overlay.notify",
      validatePayload() {},
      authorize() { throw thrown; },
      execute() { return {}; },
    };
    const executor = createActionExecutor([provider], { grantedCapabilities: ["overlay.notify"] });
    const result = await executor.execute(actionRequest(), {});
    assert.equal(result.status, "rejected");
    assert.equal(result.code, ACTION_EXECUTION_CODES.UNAUTHORIZED_ACTION);
    assert.equal(assertValidActionResult(result), true);
  }
});

test("the source action request is never mutated by execution", async () => {
  const request = actionRequest();
  const before = structuredClone(request);
  await harmlessExecutor().execute(request, { sessionAuthorized: true });
  assert.deepEqual(request, before);
});

test("executeAll rejects a non-array argument and handles an empty array", async () => {
  const executor = harmlessExecutor();
  await assert.rejects(() => executor.executeAll("not-an-array"), TypeError);
  assert.deepEqual(await executor.executeAll([]), []);
});

test("createActionExecutor rejects malformed provider descriptors and duplicate registrations", () => {
  assert.throws(() => createActionExecutor("not-an-array"), TypeError);
  assert.throws(() => createActionExecutor([{}]), TypeError);
  assert.throws(() => createActionExecutor([{ actionType: "x", requiredCapability: "y" }]), TypeError); // missing validatePayload/execute
  assert.throws(
    () => createActionExecutor([{ actionType: "x", requiredCapability: "y", validatePayload() {}, execute() {}, authorize: "not-a-function" }]),
    TypeError,
  );
  assert.throws(
    () => createActionExecutor([overlayNotificationProvider, overlayNotificationProvider]),
    /Duplicate action provider/,
  );
});

test("supportedActionTypes() and grantedCapabilities() reflect construction", () => {
  const executor = createActionExecutor(HARMLESS_LOCAL_PROVIDERS, { grantedCapabilities: ["overlay.notify"] });
  assert.deepEqual(executor.supportedActionTypes().sort(), ["overlay.notification", "system.log"]);
  assert.deepEqual(executor.grantedCapabilities(), ["overlay.notify"]);
});

test("system.log executes correctly and is independently capability-gated from overlay.notification", async () => {
  const logged = [];
  const overlayOnlyExecutor = createActionExecutor(HARMLESS_LOCAL_PROVIDERS, { grantedCapabilities: ["overlay.notify"] });
  const logRequest = actionRequest({ actionType: "system.log", payload: { level: "warn", message: "low battery" } });
  const rejected = await overlayOnlyExecutor.execute(logRequest, { sessionAuthorized: true });
  assert.equal(rejected.code, ACTION_EXECUTION_CODES.MISSING_CAPABILITY);

  const fullExecutor = harmlessExecutor();
  const executed = await fullExecutor.execute(logRequest, { sessionAuthorized: true, log: (level, message) => logged.push([level, message]) });
  assert.equal(executed.status, "executed");
  assert.deepEqual(executed.result, { logged: true, level: "warn", message: "low battery" });
  assert.deepEqual(logged, [["warn", "low battery"]]);
});

test("assertValidActionResult rejects a malformed result shape", () => {
  assert.throws(() => assertValidActionResult({ status: "executed" }), ActionResultValidationError);
  assert.throws(() => assertValidActionResult({ ...actionRequestResultShape(), status: "bogus" }), ActionResultValidationError);
});

function actionRequestResultShape() {
  return {
    status: "executed", code: "OK", message: "ok", actionType: "overlay.notification",
    sequence: 1, correlationId: "c:1", ruleId: "r", result: {}, details: null,
  };
}

test("action execution code and result content are deterministic across two freshly-constructed executors given identical valid input", async () => {
  const a = await harmlessExecutor().execute(actionRequest(), { sessionAuthorized: true });
  const b = await createActionExecutor(HARMLESS_LOCAL_PROVIDERS, { grantedCapabilities: ["overlay.notify", "system.log"] })
    .execute(actionRequest(), { sessionAuthorized: true });
  assert.equal(a.status, "executed");
  assert.equal(a.code, b.code);
  assert.equal(a.status, b.status);
  assert.deepEqual(a.result, b.result);
});

test("action execution code is deterministic and stable across identical inputs (unauthorized case)", async () => {
  const executor = harmlessExecutor();
  const results = await Promise.all([executor.execute(actionRequest(), {}), executor.execute(actionRequest({ sequence: 2 }), {})]);
  assert.deepEqual(results.map((r) => r.code), [ACTION_EXECUTION_CODES.UNAUTHORIZED_ACTION, ACTION_EXECUTION_CODES.UNAUTHORIZED_ACTION]);
});

test("action execution modules are platform-neutral and never call back into rule evaluation", () => {
  for (const file of [
    "src/actions/execute.js",
    "src/actions/providers/overlay-notification.js",
    "src/actions/providers/system-log.js",
    "src/actions/providers/index.js",
  ]) {
    const source = readFileSync(resolve(root, file), "utf8");
    assert.doesNotMatch(source, /adapters[\\/]|domains[\\/]pokemon|mGBA|BizHawk|Libretro/i, file);
    assert.doesNotMatch(
      source,
      /from\s+["'][^"']*rules[\\/]evaluate[^"']*["']/,
      `${file} must not import the rules evaluator`,
    );
  }
});

test("the rules evaluator itself never imports the action executor - rule evaluation stays side-effect-free", () => {
  const source = readFileSync(resolve(root, "src/rules/evaluate.js"), "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*actions[\\/]execute[^"']*["']/);
});

test("a full event -> rule -> action-request -> executor pipeline run using a real P03 detector event", async () => {
  const { detectPokemonEvents } = await import("../src/domains/pokemon/events.js");
  const { createEventSequencer } = await import("../src/events/derive.js");
  const pokemon = (currentHp) => ({ speciesId: 1, name: "BULBASAUR", nickname: "BUD", level: 10, currentHp, maxHp: 30, status: "none" });
  const previous = { game: { title: "POKEMON EMER" }, player: { party: [pokemon(4)], badges: null }, battle: { opponent: null }, location: { name: "Route 101" } };
  const current = { ...previous, player: { ...previous.player, party: [pokemon(0)] } };
  const events = detectPokemonEvents(previous, current, { stampEvent: createEventSequencer({ now: () => "2026-08-09T00:00:00.000Z" }) });
  const fainted = events.find((candidate) => candidate.type === "pokemon.fainted");

  const requests = evaluateRules(fainted, [rule()], { correlationId: "pipeline-test:1" });
  const notified = [];
  const executor = harmlessExecutor();
  const results = await executor.executeAll(requests, { sessionAuthorized: true, notify: (m) => notified.push(m) });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "executed");
  assert.deepEqual(notified, ["A Pokemon fainted"]);
});
