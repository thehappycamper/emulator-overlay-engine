import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDirectory = join(repositoryRoot, "src", "schemas");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function findFiles(directory, predicate) {
  const matches = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findFiles(path, predicate));
    } else if (predicate(path)) {
      matches.push(path);
    }
  }
  return matches.sort();
}

const schemas = [
  "extension.schema.json",
  "template.schema.json",
  "overlay-state.schema.json",
  "mapping.schema.json"
].map((name) => readJson(join(schemaDirectory, name)));

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
for (const schema of schemas) {
  ajv.addSchema(schema);
}

function assertValid(schemaId, file) {
  const validate = ajv.getSchema(schemaId);
  assert.ok(validate, `Schema was not registered: ${schemaId}`);
  const valid = validate(readJson(file));
  assert.equal(
    valid,
    true,
    `${relative(repositoryRoot, file)} failed schema validation:\n${ajv.errorsText(validate.errors, { separator: "\n" })}`
  );
}

test("all extension examples satisfy the extension manifest contract", async (t) => {
  const files = findFiles(join(repositoryRoot, "examples", "extensions"), (path) => path.endsWith("extension.json"));
  assert.ok(files.length > 0);

  for (const file of files) {
    await t.test(relative(repositoryRoot, file), () => {
      assertValid("https://emulator-overlay-engine.local/schemas/extension.schema.json", file);
    });
  }
});

test("all template examples satisfy the template manifest contract", async (t) => {
  const files = findFiles(join(repositoryRoot, "examples", "templates"), (path) => path.endsWith("template.json"));
  assert.ok(files.length > 0);

  for (const file of files) {
    await t.test(relative(repositoryRoot, file), () => {
      assertValid("https://emulator-overlay-engine.local/schemas/template.schema.json", file);
    });
  }
});

test("applicable normalized state fixtures satisfy the overlay state contract", async (t) => {
  const files = [
    join(repositoryRoot, "public", "sample-state.json"),
    ...findFiles(
      join(repositoryRoot, "examples"),
      (path) => /fixtures[\\/].*state\.json$/u.test(path)
    )
  ];

  for (const file of files) {
    await t.test(relative(repositoryRoot, file), () => {
      assertValid("https://emulator-overlay-engine.local/schemas/overlay-state.schema.json", file);
    });
  }
});

test("mapping example satisfies the mapping project contract", () => {
  assertValid(
    "https://emulator-overlay-engine.local/schemas/mapping.schema.json",
    join(repositoryRoot, "examples", "mapping-project", "mapping.example.json")
  );
});

test("mapping schema rejects executable expression concepts", () => {
  const validate = ajv.getSchema("https://emulator-overlay-engine.local/schemas/mapping.schema.json");
  const mapping = readJson(join(repositoryRoot, "examples", "mapping-project", "mapping.example.json"));
  mapping.calculatedFields[0].expression = { op: "call", function: "process.exit", args: [] };

  assert.equal(validate(mapping), false);
});

test("template module types reuse and enforce the extension type contract", () => {
  const validate = ajv.getSchema("https://emulator-overlay-engine.local/schemas/template.schema.json");
  const template = readJson(join(repositoryRoot, "examples", "templates", "pokemon-emerald-challenge", "template.json"));
  template.modules[0].type = "arbitrary-code";

  assert.equal(validate(template), false);
  assert.ok(validate.errors.some((error) => error.keyword === "enum"));
});
