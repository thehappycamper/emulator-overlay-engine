import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDirectory = join(repositoryRoot, "src", "schemas");
const pokemonSchemaDirectory = join(repositoryRoot, "src", "domains", "pokemon", "schemas");
const emeraldSourceSchemaPath = join(
  repositoryRoot,
  "adapters",
  "gen3-mgba",
  "schemas",
  "emerald-us-rev0-source.schema.json"
);
const pokemonStateSchemaId = "https://emulator-overlay-engine.local/schemas/overlay-state.schema.json";

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

const platformSchemas = [
  "extension.schema.json",
  "template.schema.json",
  "mapping.schema.json"
].map((name) => readJson(join(schemaDirectory, name)));
const extensionSchema = platformSchemas.find((schema) => schema.$id.endsWith("/extension.schema.json"));
const pokemonStateSchema = readJson(join(pokemonSchemaDirectory, "overlay-state.schema.json"));
const emeraldSourceSchema = readJson(emeraldSourceSchemaPath);
const legacyStateSchema = readJson(join(schemaDirectory, "overlay-state.schema.json"));

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
for (const schema of [...platformSchemas, pokemonStateSchema, emeraldSourceSchema]) {
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

test("all extension examples and adapters satisfy the extension manifest contract", async (t) => {
  const files = [
    ...findFiles(join(repositoryRoot, "examples", "extensions"), (path) => path.endsWith("extension.json")),
    ...findFiles(join(repositoryRoot, "adapters"), (path) => path.endsWith("extension.json")),
  ].sort();
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

test("applicable normalized state fixtures satisfy the canonical Pokemon state contract", async (t) => {
  const files = [
    join(repositoryRoot, "public", "sample-state.json"),
    ...findFiles(
      join(repositoryRoot, "examples"),
      (path) => /fixtures[\\/].*state\.json$/u.test(path)
    )
  ];

  for (const file of files) {
    await t.test(relative(repositoryRoot, file), () => {
      assertValid(pokemonStateSchemaId, file);
    });
  }
});

test("canonical Pokemon state contract rejects invalid Pokemon state", () => {
  const validate = ajv.getSchema(pokemonStateSchemaId);
  const state = readJson(join(repositoryRoot, "public", "sample-state.json"));
  delete state.player.party;

  assert.equal(validate(state), false);
  assert.ok(validate.errors.some((error) => error.keyword === "required" && error.params.missingProperty === "party"));
});

test("legacy platform schema path delegates to the Pokemon-owned contract", () => {
  assert.equal(legacyStateSchema.$ref, pokemonStateSchemaId);
  assert.equal("properties" in legacyStateSchema, false);
  assert.equal("$defs" in legacyStateSchema, false);

  const validate = ajv.compile(legacyStateSchema);
  const validState = readJson(join(repositoryRoot, "public", "sample-state.json"));
  const invalidState = { ...validState, player: {} };

  assert.equal(validate(validState), true);
  assert.equal(validate(invalidState), false);
});

test("Pokemon state remains a direct payload for current consumers", () => {
  const state = readJson(join(repositoryRoot, "public", "sample-state.json"));

  assert.ok(state.player.party);
  assert.ok(state.battle);
  assert.equal("domain" in state, false);
  assert.equal("payload" in state, false);
});

test("all mapping projects satisfy the mapping project contract", async (t) => {
  const files = [
    join(repositoryRoot, "examples", "mapping-project", "mapping.example.json"),
    ...findFiles(join(repositoryRoot, "adapters"), (path) => path.endsWith(".mapping.json")),
  ].sort();

  for (const file of files) {
    await t.test(relative(repositoryRoot, file), () => {
      assertValid("https://emulator-overlay-engine.local/schemas/mapping.schema.json", file);
    });
  }
});

test("Emerald acquisition source fixtures satisfy their adapter-owned contract", async (t) => {
  const files = findFiles(
    join(repositoryRoot, "adapters", "gen3-mgba", "fixtures"),
    (path) => path.endsWith(".source.json")
  );
  assert.ok(files.length > 0);

  for (const file of files) {
    await t.test(relative(repositoryRoot, file), () => {
      assertValid(emeraldSourceSchema.$id, file);
    });
  }
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

test("UI slot identifiers are domain-extensible and preserve legacy values", () => {
  const validateExtension = ajv.getSchema("https://emulator-overlay-engine.local/schemas/extension.schema.json");
  const extension = readJson(join(repositoryRoot, "examples", "extensions", "overlay-panel-extension", "extension.json"));
  extension.ui.slots = ["party", "pokemon.party", "sidebar"];

  assert.equal(validateExtension(extension), true);
  assert.equal(extensionSchema.properties.ui.properties.slots.items.$ref, "#/$defs/uiSlotId");
  assert.equal("enum" in extensionSchema.$defs.uiSlotId, false);

  extension.ui.slots = ["Pokemon Party"];
  assert.equal(validateExtension(extension), false);
  assert.ok(validateExtension.errors.some((error) => error.keyword === "pattern"));

  const validateTemplate = ajv.getSchema("https://emulator-overlay-engine.local/schemas/template.schema.json");
  const template = readJson(join(repositoryRoot, "examples", "templates", "pokemon-emerald-challenge", "template.json"));
  assert.ok(template.ui.panels.every((panel) => panel.slot.startsWith("pokemon.")));
  assert.equal(validateTemplate(template), true);
});
