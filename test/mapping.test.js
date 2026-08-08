import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyMappingProject, setJsonPointer } from "../src/mapping/apply.js";

const mappingProject = JSON.parse(readFileSync(
  new URL("../examples/mapping-project/mapping.example.json", import.meta.url),
  "utf8"
));

test("fusion example executes direct mappings and safe calculated fields", () => {
  const target = applyMappingProject(mappingProject, {
    fusion_id: 1000123,
    fusion_name: "Venustoise",
    head_id: 3,
    body_id: 9,
    primary_type: "grass",
    secondary_type: "water"
  });

  assert.deepEqual(target, {
    speciesId: 1000123,
    display: { name: "Venustoise" },
    components: [
      { speciesId: 3 },
      { speciesId: 9 }
    ],
    name: "Venustoise",
    types: ["grass", "water"]
  });
});

test("fusion example compacts a missing optional secondary type", () => {
  const target = applyMappingProject(mappingProject, {
    fusion_id: 1000001,
    fusion_name: "Example",
    head_id: 1,
    body_id: 2,
    primary_type: "normal"
  });

  assert.deepEqual(target.types, ["normal"]);
});

test("value mappings translate identifiers without executable code", () => {
  const project = {
    source: { id: "example.source", type: "record", version: "1" },
    target: { id: "example.target", type: "record", version: "1" },
    valueMappings: [{
      sourcePath: "/status_code",
      targetPath: "/status",
      entries: [{ from: 1, to: "ready" }]
    }]
  };

  assert.deepEqual(applyMappingProject(project, { status_code: 1 }), { status: "ready" });
  assert.throws(() => applyMappingProject(project, { status_code: 2 }), /No value mapping matched/);
});

test("declared target validation runs after calculated fields", () => {
  let receivedTarget;
  const target = applyMappingProject(mappingProject, {
    fusion_id: 10,
    fusion_name: "Mapped",
    head_id: 1,
    body_id: 2,
    primary_type: "normal"
  }, {
    validateTarget(value) {
      receivedTarget = value;
      return value.name === "Mapped";
    }
  });

  assert.equal(receivedTarget, target);
  assert.equal(target.name, "Mapped");
});

test("required source and target paths fail closed", () => {
  assert.throws(
    () => applyMappingProject(mappingProject, { fusion_id: 1 }),
    /Source is missing required path/
  );
});

test("JSON Pointer writes create arrays without sparse gaps", () => {
  const target = {};

  setJsonPointer(target, "/items/0/name", "first");

  assert.deepEqual(target, { items: [{ name: "first" }] });
});

test("JSON Pointer writes can continue through and replace existing array elements", () => {
  const target = { items: [{ name: "before" }] };

  setJsonPointer(target, "/items/0/name", "after");
  assert.deepEqual(target.items, [{ name: "after" }]);

  setJsonPointer(target, "/items/0", { name: "replacement" });
  assert.deepEqual(target.items, [{ name: "replacement" }]);
});

test("JSON Pointer array index equal to length appends", () => {
  const target = { items: [{ id: 1 }] };

  setJsonPointer(target, "/items/1", { id: 2 });

  assert.deepEqual(target.items, [{ id: 1 }, { id: 2 }]);
});

test("JSON Pointer array index greater than length is rejected", () => {
  const target = { items: [] };

  assert.throws(
    () => setJsonPointer(target, "/items/1", "gap"),
    /index 1 exceeds current length 0/
  );
  assert.equal(target.items.length, 0);
});

test("JSON Pointer writes reject pre-existing sparse array holes", () => {
  const items = [];
  items.length = 1;

  assert.throws(
    () => setJsonPointer({ items }, "/items/0", "gap"),
    /does not reference an existing element/
  );
  assert.equal(Object.prototype.hasOwnProperty.call(items, 0), false);
});

test("huge JSON Pointer array indices fail before amplifying array length", () => {
  const target = {};

  assert.throws(
    () => setJsonPointer(target, "/arr/999999999/x", true),
    /index 999999999 exceeds current length 0/
  );
  assert.equal(target.arr.length, 0);
});

test("JSON Pointer writes preserve prototype-pollution protections", () => {
  const target = {};

  assert.throws(
    () => setJsonPointer(target, "/__proto__/polluted", true),
    /not allowed/
  );
  assert.equal({}.polluted, undefined);
});

test("calculated fields can read target values from earlier calculated fields", () => {
  const project = {
    source: { id: "example.source", type: "record", version: "1" },
    target: { id: "example.target", type: "record", version: "1" },
    calculatedFields: [
      {
        targetPath: "/base",
        expression: { op: "literal", value: 6 }
      },
      {
        targetPath: "/doubled",
        expression: {
          op: "multiply",
          args: [
            { op: "field", root: "target", path: "/base" },
            { op: "literal", value: 2 }
          ]
        }
      }
    ]
  };

  assert.deepEqual(applyMappingProject(project, {}), { base: 6, doubled: 12 });
});
