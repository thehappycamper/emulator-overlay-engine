import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import { LocalConfigError, parseLocalEnv } from "./local-env.mjs";

export const BIZHAWK_PROOF_CONFIG_FILE = ".env.bizhawk.local";
export const SUPPORTED_BIZHAWK_VERSION = "2.11.1";
export const SUPPORTED_SYSTEM_ID = "GBA";
export const EMERALD_US_REV0_SHA1 = "F3AE088181BF583E55DAF962A92BB46F4F1D07B7";

export const BIZHAWK_PROOF_VARIABLES = Object.freeze([
  "EOE_BIZHAWK_EXE",
  "EOE_BIZHAWK_EMERALD_ROM",
  "EOE_BIZHAWK_EMERALD_SAVESTATE",
  "EMERALD_SOURCE_SNAPSHOT_PATH",
  "EOE_LIVE_STATE_PATH",
  "EMERALD_MAPPING_POLL_INTERVAL_MS",
  "PORT",
]);

const REQUIRED_VARIABLES = Object.freeze([
  "EOE_BIZHAWK_EXE",
  "EOE_BIZHAWK_EMERALD_ROM",
  "EMERALD_SOURCE_SNAPSHOT_PATH",
  "EOE_LIVE_STATE_PATH",
]);

export class BizHawkProofConfigError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "BizHawkProofConfigError";
  }
}

function selectProofVariables(fileValues, environment) {
  return Object.fromEntries(
    BIZHAWK_PROOF_VARIABLES.flatMap((key) => {
      const environmentValue = environment[key];
      if (environmentValue !== undefined && environmentValue !== "") {
        return [[key, environmentValue]];
      }
      return fileValues[key] !== undefined ? [[key, fileValues[key]]] : [];
    }),
  );
}

function resolveConfiguredPath(value, projectRoot) {
  return isAbsolute(value) ? resolve(value) : resolve(projectRoot, value);
}

export function buildBizHawkProofConfig(
  values,
  { projectRoot = process.cwd() } = {},
) {
  const missing = REQUIRED_VARIABLES.filter((key) => !values[key]?.trim());
  if (missing.length > 0) {
    throw new BizHawkProofConfigError(
      `Missing required local configuration: ${missing.join(", ")}`,
    );
  }

  const pollIntervalText = values.EMERALD_MAPPING_POLL_INTERVAL_MS?.trim() || "250";
  const mappingPollIntervalMs = Number(pollIntervalText);
  if (!Number.isFinite(mappingPollIntervalMs) || mappingPollIntervalMs <= 0) {
    throw new BizHawkProofConfigError(
      "EMERALD_MAPPING_POLL_INTERVAL_MS must be a positive number",
    );
  }

  const portText = values.PORT?.trim() || "5173";
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BizHawkProofConfigError("PORT must be an integer from 1 through 65535");
  }

  return Object.freeze({
    bizhawkExecutable: resolveConfiguredPath(values.EOE_BIZHAWK_EXE.trim(), projectRoot),
    emeraldRom: resolveConfiguredPath(values.EOE_BIZHAWK_EMERALD_ROM.trim(), projectRoot),
    emeraldSavestate: values.EOE_BIZHAWK_EMERALD_SAVESTATE?.trim()
      ? resolveConfiguredPath(values.EOE_BIZHAWK_EMERALD_SAVESTATE.trim(), projectRoot)
      : undefined,
    sourceSnapshot: resolveConfiguredPath(
      values.EMERALD_SOURCE_SNAPSHOT_PATH.trim(),
      projectRoot,
    ),
    liveState: resolveConfiguredPath(values.EOE_LIVE_STATE_PATH.trim(), projectRoot),
    connectorPath: resolve(projectRoot, "adapters", "bizhawk", "proof-connector.lua"),
    acquisitionModule: resolve(
      projectRoot,
      "adapters",
      "pokemon-emerald-us-rev0",
      "emerald-acquisition.lua",
    ),
    mappingPollIntervalMs,
    port,
    expectedBizHawkVersion: SUPPORTED_BIZHAWK_VERSION,
    expectedSystemId: SUPPORTED_SYSTEM_ID,
    expectedRomHash: EMERALD_US_REV0_SHA1,
  });
}

export async function loadBizHawkProofConfig({
  configPath = resolve(BIZHAWK_PROOF_CONFIG_FILE),
  environment = process.env,
  projectRoot = process.cwd(),
  fileSystem = { readFile },
} = {}) {
  let text;
  try {
    text = await fileSystem.readFile(configPath, "utf8");
  } catch (error) {
    throw new BizHawkProofConfigError(
      `Could not read local config at ${configPath}. Create it from .env.bizhawk.local.example.`,
      { cause: error },
    );
  }

  let fileValues;
  try {
    fileValues = parseLocalEnv(text);
  } catch (error) {
    if (error instanceof LocalConfigError) {
      throw new BizHawkProofConfigError(error.message, { cause: error });
    }
    throw error;
  }

  return buildBizHawkProofConfig(selectProofVariables(fileValues, environment), {
    projectRoot,
  });
}

async function assertFile(path, label, fileSystem) {
  let details;
  try {
    details = await fileSystem.stat(path);
  } catch (error) {
    throw new BizHawkProofConfigError(`${label} does not exist: ${path}`, {
      cause: error,
    });
  }
  if (!details.isFile()) {
    throw new BizHawkProofConfigError(`${label} must be a file: ${path}`);
  }
}

async function assertOutputPath(path, label, fileSystem) {
  try {
    const details = await fileSystem.stat(path);
    if (!details.isFile()) {
      throw new BizHawkProofConfigError(`${label} must be a file path: ${path}`);
    }
  } catch (error) {
    if (error instanceof BizHawkProofConfigError) {
      throw error;
    }
    if (error?.code !== "ENOENT") {
      throw new BizHawkProofConfigError(`Could not inspect ${label}: ${path}`, {
        cause: error,
      });
    }
  }
}

export async function validateBizHawkProofConfig(
  config,
  { fileSystem = { stat } } = {},
) {
  await assertFile(config.bizhawkExecutable, "EOE_BIZHAWK_EXE", fileSystem);
  await assertFile(config.emeraldRom, "EOE_BIZHAWK_EMERALD_ROM", fileSystem);
  if (config.emeraldSavestate) {
    await assertFile(
      config.emeraldSavestate,
      "EOE_BIZHAWK_EMERALD_SAVESTATE",
      fileSystem,
    );
  }
  await assertFile(config.connectorPath, "BizHawk proof connector", fileSystem);
  await assertFile(config.acquisitionModule, "Shared Emerald acquisition module", fileSystem);
  await assertOutputPath(
    config.sourceSnapshot,
    "EMERALD_SOURCE_SNAPSHOT_PATH",
    fileSystem,
  );
  await assertOutputPath(config.liveState, "EOE_LIVE_STATE_PATH", fileSystem);
  return true;
}

export async function prepareBizHawkProofDirectory(
  config,
  { fileSystem = { mkdir } } = {},
) {
  await fileSystem.mkdir(dirname(config.sourceSnapshot), { recursive: true });
  await fileSystem.mkdir(dirname(config.liveState), { recursive: true });
}

export function createBizHawkLaunch(config, { environment = process.env } = {}) {
  const args = [
    `--lua=${config.connectorPath}`,
    ...(config.emeraldSavestate ? [`--load-state=${config.emeraldSavestate}`] : []),
    config.emeraldRom,
  ];

  return Object.freeze({
    executable: config.bizhawkExecutable,
    args: Object.freeze(args),
    environment: Object.freeze({
      ...environment,
      EMERALD_SOURCE_SNAPSHOT_PATH: config.sourceSnapshot,
      EMERALD_ACQUISITION_MODULE_PATH: config.acquisitionModule,
      EOE_LIVE_STATE_PATH: config.liveState,
      EMERALD_MAPPING_POLL_INTERVAL_MS: String(config.mappingPollIntervalMs),
      PORT: String(config.port),
      BIZHAWK_EXPECTED_VERSION: config.expectedBizHawkVersion,
      BIZHAWK_EXPECTED_SYSTEM_ID: config.expectedSystemId,
      BIZHAWK_EXPECTED_ROM_HASH: config.expectedRomHash,
    }),
  });
}
