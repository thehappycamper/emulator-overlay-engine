import assert from "node:assert/strict";
import test from "node:test";
import { createDomainRegistry } from "../src/platform/domain-registry.js";

test("the platform registry has no implicit domain implementation", () => {
  const registry = createDomainRegistry();

  assert.equal(registry.has("pokemon"), false);
  assert.throws(() => registry.resolve("pokemon"), /Unknown domain: pokemon/);
});

test("duplicate domain ids are rejected at construction", () => {
  assert.throws(
    () => createDomainRegistry([{ id: "widget" }, { id: "widget" }]),
    /Duplicate domain id: widget/
  );
});

test("registering a mutable descriptor still resolves correctly", () => {
  const widget = {
    id: "widget",
    calculators: {
      double: (value) => value * 2
    }
  };

  const registry = createDomainRegistry([widget]);
  const resolved = registry.resolve("widget");

  assert.equal(resolved.id, "widget");
  assert.equal(resolved.calculators.double(21), 42);
});

test("mutating the original top-level descriptor after registration does not affect resolution", () => {
  const widget = { id: "widget", label: "original" };
  const registry = createDomainRegistry([widget]);

  assert.throws(() => { widget.label = "tampered"; }, TypeError);
  assert.throws(() => { widget.id = "tampered"; }, TypeError);

  const resolved = registry.resolve("widget");
  assert.equal(resolved.label, "original");
  assert.equal(resolved.id, "widget");
});

test("mutating a nested calculator/module map from the original object does not affect resolution", () => {
  const widget = {
    id: "widget",
    calculators: {
      double: (value) => value * 2
    }
  };
  createDomainRegistry([widget]); // registration is enough to freeze the whole tree

  assert.throws(() => { widget.calculators.double = () => "TAMPERED"; }, TypeError);
  assert.throws(() => { widget.calculators.triple = (value) => value * 3; }, TypeError);

  assert.equal(widget.calculators.double(10), 20);
  assert.deepEqual(Object.keys(widget.calculators), ["double"]);
});

test("deeply nested metadata containers are also frozen, not just the top two levels", () => {
  const widget = {
    id: "widget",
    metadata: {
      tags: ["alpha", "beta"],
      nested: { deeper: { value: 1 } }
    }
  };
  const registry = createDomainRegistry([widget]);
  const resolved = registry.resolve("widget");

  assert.throws(() => { resolved.metadata.tags.push("gamma"); }, TypeError);
  assert.throws(() => { resolved.metadata.nested.deeper.value = 2; }, TypeError);
  assert.deepEqual(resolved.metadata.tags, ["alpha", "beta"]);
  assert.equal(resolved.metadata.nested.deeper.value, 1);
});

test("mutation attempts through the resolved descriptor itself are rejected the same way", () => {
  const widget = { id: "widget", calculators: { double: (value) => value * 2 } };
  const registry = createDomainRegistry([widget]);
  const resolved = registry.resolve("widget");

  assert.throws(() => { resolved.id = "tampered"; }, TypeError);
  assert.throws(() => { resolved.calculators.double = () => "TAMPERED"; }, TypeError);
  assert.throws(() => { resolved.newField = "injected"; }, TypeError);

  assert.equal(registry.resolve("widget"), resolved);
  assert.equal(resolved.calculators.double(5), 10);
});

test("functions inside a descriptor keep their identity and are callable, not deep-frozen away", () => {
  const double = (value) => value * 2;
  const widget = { id: "widget", calculators: { double } };
  const registry = createDomainRegistry([widget]);
  const resolved = registry.resolve("widget");

  assert.equal(resolved.calculators.double, double);
  assert.equal(resolved.calculators.double(4), 8);
});

test("a descriptor with a circular reference is frozen without infinite recursion", () => {
  const widget = { id: "widget" };
  widget.self = widget;

  const registry = createDomainRegistry([widget]);
  const resolved = registry.resolve("widget");

  assert.equal(resolved.self, resolved);
  assert.ok(Object.isFrozen(resolved));
  assert.throws(() => { resolved.self.id = "tampered"; }, TypeError);
});

test("registering an already-frozen descriptor is a harmless no-op", () => {
  const widget = Object.freeze({ id: "widget", calculators: Object.freeze({ double: (value) => value * 2 }) });
  const registry = createDomainRegistry([widget]);

  assert.equal(registry.resolve("widget"), widget);
  assert.equal(registry.resolve("widget").calculators.double(3), 6);
});
