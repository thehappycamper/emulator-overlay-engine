import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import { assertValidActionRequest, ActionRequestValidationError } from "../src/actions/validate.js";
import { evaluateRules } from "../src/rules/evaluate.js";
import { assertValidRule, RuleValidationError } from "../src/rules/validate.js";
import { detectPokemonEvents } from "../src/domains/pokemon/events.js";
import { createEventSequencer } from "../src/events/derive.js";

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

function compileSchemas() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const eventSchema = JSON.parse(readFileSync(resolve(root, "src/events/schemas/event-envelope.schema.json"), "utf8"));
  const ruleSchema = JSON.parse(readFileSync(resolve(root, "src/rules/schemas/rule.schema.json"), "utf8"));
  const actionSchema = JSON.parse(readFileSync(resolve(root, "src/actions/schemas/action-request.schema.json"), "utf8"));
  ajv.addSchema(eventSchema);
  return { validateRule: ajv.compile(ruleSchema), validateAction: ajv.compile(actionSchema) };
}

test("rule and action schemas accept the declarative example and reject malformed contracts", () => {
  const { validateRule, validateAction } = compileSchemas();
  const validRule = rule();
  assert.equal(validateRule(validRule), true);
  const request = evaluateRules(event(), [validRule])[0];
  assert.equal(validateAction(request), true);
  assert.throws(() => assertValidRule({ ...validRule, id: "" }), RuleValidationError);
  assert.throws(() => assertValidActionRequest({ ...request, actionType: "" }), ActionRequestValidationError);
});

test("event matching, predicates, and disabled rules are deterministic", () => {
  const matching = rule({
    predicates: [
      { path: "/subject/kind", op: "equals", value: "party" },
      { path: "/previous/currentHp", op: "greaterThan", value: 0 },
      { path: "/current/currentHp", op: "lessThan", value: 1 },
      { path: "/provenance/domain", op: "exists" },
      { path: "/missing", op: "notExists" },
      { path: "/type", op: "notEquals", value: "pokemon.healed" },
    ],
  });
  assert.equal(evaluateRules(event(), [matching]).length, 1);
  assert.equal(evaluateRules({ ...event(), type: "pokemon.healed" }, [matching]).length, 0);
  assert.equal(evaluateRules(event(), [{ ...matching, enabled: false }]).length, 0);
  assert.equal(evaluateRules(event(), [{ ...matching, predicates: [{ path: "/current/currentHp", op: "equals", value: 4 }] }]).length, 0);
});

test("multiple rules and actions preserve declaration order and assign request sequence", () => {
  const first = rule({ id: "first", actions: [{ actionType: "overlay.notification", payload: { message: "first" } }, { actionType: "overlay.notification", payload: { message: "second" } }] });
  const second = rule({ id: "second" });
  const requests = evaluateRules(event(), [first, second], { correlationId: "run:1", sequenceStart: 10 });
  assert.deepEqual(requests.map((request) => [request.sequence, request.ruleId, request.payload.message]), [
    [10, "first", "first"], [11, "first", "second"], [12, "second", "A Pokemon fainted"],
  ]);
});

test("unsupported or malformed action declarations fail closed", () => {
  assert.throws(() => evaluateRules(event(), [rule({ actions: [{ actionType: "provider.write", payload: {} }] })]), /Unsupported action type/);
  assert.throws(() => evaluateRules(event(), [rule({ actions: [{ actionType: "overlay.notification", payload: {} }] })]), /payload\.message/);
  assert.throws(() => evaluateRules(event(), [rule({ predicates: [{ path: "/type", op: "invoke" }] })]), RuleValidationError);
  assert.equal(evaluateRules(event(), [rule({ predicates: [{ path: "/constructor/x", op: "exists" }] })]).length, 0);
});

test("evaluation does not mutate the source event and repeated events are independently evaluated", () => {
  const source = event();
  const before = structuredClone(source);
  const first = evaluateRules(source, [rule()]);
  const second = evaluateRules(source, [rule()]);
  assert.deepEqual(source, before);
  assert.deepEqual(first, second);
  assert.notEqual(first[0].triggeringEvent, source);
});

test("a real Pokemon fainted detector event can trigger a generic rule", () => {
  const pokemon = (currentHp) => ({ speciesId: 1, name: "BULBASAUR", nickname: "BUD", level: 10, currentHp, maxHp: 30, status: "none" });
  const previous = { game: { title: "POKEMON EMER" }, player: { party: [pokemon(4)], badges: null }, battle: { opponent: null }, location: { name: "Route 101" } };
  const current = { ...previous, player: { ...previous.player, party: [pokemon(0)] } };
  const events = detectPokemonEvents(previous, current, { stampEvent: createEventSequencer({ now: () => "2026-08-09T00:00:00.000Z" }) });
  const fainted = events.find((candidate) => candidate.type === "pokemon.fainted");
  assert.ok(fainted);
  const requests = evaluateRules(fainted, [rule()], { correlationId: "pokemon-test:1" });
  assert.equal(requests[0].actionType, "overlay.notification");
  assert.equal(requests[0].ruleId, "notify-faint");
  assert.equal(requests[0].triggeringEvent.type, "pokemon.fainted");
});

test("rules and actions are platform-neutral modules", () => {
  for (const file of ["src/rules/evaluate.js", "src/rules/validate.js", "src/actions/validate.js"]) {
    const source = readFileSync(resolve(root, file), "utf8");
    assert.doesNotMatch(source, /adapters[\\/]|domains[\\/]pokemon|mGBA|BizHawk|Libretro/i, file);
  }
});
