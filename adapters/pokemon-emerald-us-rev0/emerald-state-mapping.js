import { readFileSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

import { pokemonStateContract } from "../../src/domains/pokemon/index.js";
import { applyMappingProject } from "../../src/mapping/apply.js";
import { writeJsonAtomically } from "./atomic-json-file.js";
import { EMERALD_SOURCE_CONTRACT } from "./emerald-source-contract.js";
import { assertValidEmeraldSourceSnapshot } from "./validate-source-snapshot.js";

const mappingProjectUrl = new URL(
  "./mappings/emerald-us-rev0-to-pokemon-overlay-state.mapping.json",
  import.meta.url,
);
const mappingSchemaUrl = new URL("../../src/schemas/mapping.schema.json", import.meta.url);
const pokemonStateSchemaUrl = new URL(
  "../../src/domains/pokemon/schemas/overlay-state.schema.json",
  import.meta.url,
);

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

const defaultMappingProject = readJson(mappingProjectUrl);
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validateMappingProject = ajv.compile(readJson(mappingSchemaUrl));
const validatePokemonState = ajv.compile(readJson(pokemonStateSchemaUrl));

class ContractValidationError extends TypeError {
  constructor(label, errors) {
    super(`${label} failed validation: ${ajv.errorsText(errors)}`);
    this.name = "ContractValidationError";
    this.errors = structuredClone(errors ?? []);
  }
}

export function loadEmeraldStateMappingProject() {
  return structuredClone(defaultMappingProject);
}

export function assertValidEmeraldStateMappingProject(project) {
  if (!validateMappingProject(project)) {
    throw new ContractValidationError("Emerald mapping project", validateMappingProject.errors);
  }
  return true;
}

export function assertValidPokemonState(state) {
  if (!validatePokemonState(state)) {
    throw new ContractValidationError("Pokemon normalized state", validatePokemonState.errors);
  }
  return true;
}

function assertContractDescriptors(project) {
  if (
    project.source.id !== EMERALD_SOURCE_CONTRACT.id ||
    project.source.type !== "acquisition-source-snapshot" ||
    project.source.version !== EMERALD_SOURCE_CONTRACT.version ||
    project.source.schema !== EMERALD_SOURCE_CONTRACT.schemaId
  ) {
    throw new TypeError("Mapping source descriptor does not match the Emerald acquisition contract");
  }
  if (
    project.target.id !== pokemonStateContract.id ||
    project.target.type !== pokemonStateContract.type ||
    project.target.version !== pokemonStateContract.version ||
    project.target.schema !== pokemonStateContract.schema
  ) {
    throw new TypeError("Mapping target descriptor does not match the Pokemon state contract");
  }
}

export function mapEmeraldSourceSnapshot(source, options = {}) {
  const project = options.mappingProject ?? loadEmeraldStateMappingProject();
  assertValidEmeraldSourceSnapshot(source);
  assertValidEmeraldStateMappingProject(project);
  assertContractDescriptors(project);

  return applyMappingProject(project, source, {
    validateTarget(target, descriptor, schemaId) {
      if (
        descriptor.id !== pokemonStateContract.id ||
        descriptor.version !== pokemonStateContract.version ||
        schemaId !== pokemonStateContract.schema
      ) {
        throw new TypeError("Mapping runtime requested an unexpected target contract");
      }
      assertValidPokemonState(target);
      return true;
    },
  });
}

export async function writePokemonLiveState(destination, state, options = {}) {
  assertValidPokemonState(state);
  return writeJsonAtomically(destination, state, options);
}

export async function mapEmeraldSourceFile({
  sourcePath,
  targetPath,
  mappingProject,
  fileSystem,
}) {
  const source = JSON.parse(await readFileAsync(sourcePath, "utf8"));
  const state = mapEmeraldSourceSnapshot(source, { mappingProject });
  await writePokemonLiveState(targetPath, state, { fileSystem });
  return state;
}
