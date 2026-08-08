import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyMappingProject } from "../src/mapping/apply.js";

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
