import assert from "node:assert/strict";
import test from "node:test";
import { evaluateExpression } from "../src/expressions/evaluate.js";

const field = (path, root) => ({
  op: "field",
  ...(root ? { root } : {}),
  path
});

const literal = (value) => ({ op: "literal", value });

test("field expressions resolve JSON Pointer paths from explicit roots", () => {
  const environment = {
    source: { nested: { values: [4, 8] } },
    target: { mapped: "ready" },
    context: { scale: 2 }
  };

  assert.equal(evaluateExpression(field("/nested/values/1"), environment), 8);
  assert.equal(evaluateExpression(field("/mapped", "target"), environment), "ready");
  assert.equal(evaluateExpression(field("/scale", "context"), environment), 2);
});

test("missing fields resolve to undefined without reading inherited properties", () => {
  assert.equal(evaluateExpression(field("/missing"), { source: {} }), undefined);
  assert.equal(evaluateExpression(field("/toString"), { source: {} }), undefined);
});

test("literal expressions return isolated JSON values", () => {
  const expression = literal({ enabled: true, values: [1, 2] });
  const result = evaluateExpression(expression);

  assert.deepEqual(result, expression.value);
  assert.notEqual(result, expression.value);
  assert.notEqual(result.values, expression.value.values);
});

test("arithmetic expressions use finite numeric operands", () => {
  assert.equal(evaluateExpression({ op: "add", args: [literal(2), literal(3), literal(4)] }), 9);
  assert.equal(evaluateExpression({ op: "multiply", args: [literal(3), literal(5)] }), 15);
  assert.throws(
    () => evaluateExpression({ op: "divide", args: [literal(4), literal(0)] }),
    /divide by zero/
  );
});

test("comparison and boolean expressions return booleans", () => {
  const comparison = { op: "greaterThanOrEqual", left: field("/level"), right: literal(50) };
  const expression = {
    op: "and",
    args: [comparison, { op: "notEqual", left: field("/status"), right: literal("disabled") }]
  };

  assert.equal(evaluateExpression(expression, { source: { level: 50, status: "ready" } }), true);
  assert.throws(
    () => evaluateExpression({ op: "greaterThan", left: literal({ value: 2 }), right: literal(1) }),
    /primitive JSON operands/
  );
});

test("conditional expressions evaluate only the selected branch", () => {
  const expression = {
    op: "if",
    condition: { op: "equal", left: field("/mode"), right: literal("active") },
    then: field("/value"),
    else: { op: "divide", args: [literal(1), literal(0)] }
  };

  assert.equal(evaluateExpression(expression, { source: { mode: "active", value: 12 } }), 12);
});

test("coalesce and default preserve false and zero while replacing null or missing values", () => {
  assert.equal(evaluateExpression({
    op: "coalesce",
    args: [field("/missing"), literal(null), literal(0), literal(12)]
  }, { source: {} }), 0);

  assert.equal(evaluateExpression({
    op: "default",
    value: field("/optional"),
    fallback: literal("fallback")
  }, { source: {} }), "fallback");

  assert.equal(evaluateExpression({
    op: "default",
    value: field("/optional"),
    fallback: literal(true)
  }, { source: { optional: false } }), false);
});

test("array and compact expressions reproduce structural filter(Boolean) behavior", () => {
  const expression = {
    op: "compact",
    value: {
      op: "array",
      items: [field("/primary"), field("/secondary"), literal(""), literal(false), literal(0)]
    }
  };

  assert.deepEqual(
    evaluateExpression(expression, { source: { primary: "alpha", secondary: null } }),
    ["alpha"]
  );
});

test("unknown operators and arbitrary invocation concepts are rejected", () => {
  assert.throws(() => evaluateExpression({ op: "call", name: "process.exit", args: [] }), /Unknown expression operator/);
  assert.throws(
    () => evaluateExpression({ op: "field", path: "/value", method: "toString" }, { source: { value: 1 } }),
    /not allowed/
  );
  assert.throws(() => evaluateExpression(literal(() => 1)), /JSON-serializable/);
});

test("host and prototype APIs are not addressable through field expressions", () => {
  const environment = { source: {}, target: {}, context: {} };

  assert.equal(evaluateExpression(field("/process"), environment), undefined);
  assert.equal(evaluateExpression(field("/globalThis", "context"), environment), undefined);
  assert.equal(evaluateExpression(field("/window"), environment), undefined);
  assert.equal(evaluateExpression(field("/Function"), environment), undefined);
  assert.throws(() => evaluateExpression(field("/constructor"), environment), /not allowed/);
  assert.throws(() => evaluateExpression(field("/__proto__/polluted"), environment), /not allowed/);
});
