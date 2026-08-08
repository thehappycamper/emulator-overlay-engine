import assert from "node:assert/strict";
import test from "node:test";
import { createDomainRegistry } from "../src/platform/domain-registry.js";

test("the platform registry has no implicit domain implementation", () => {
  const registry = createDomainRegistry();

  assert.equal(registry.has("pokemon"), false);
  assert.throws(() => registry.resolve("pokemon"), /Unknown domain: pokemon/);
});
