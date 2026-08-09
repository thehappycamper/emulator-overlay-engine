import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

export const EMERALD_PROOF_CONFIG_FILE = ".env.local";

export const EMERALD_PROOF_VARIABLES = Object.freeze([
  "EOE_MGBA_EXE",
  "EOE_EMERALD_ROM",
  "EOE_EMERALD_SAVESTATE",
  "EMERALD_SOURCE_SNAPSHOT_PATH",
  "EOE_LIVE_STATE_PATH",
  "EMERALD_MAPPING_POLL_INTERVAL_MS",
  "PORT",
]);

const REQUIRED_VARIABLES = Object.freeze([
  "EOE_MGBA_EXE",
  "EOE_EMERALD_ROM",
  "EMERALD_SOURCE_SNAPSHOT_PATH",
  "EOE_LIVE_STATE_PATH",
]);

export class EmeraldProofConfigError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "EmeraldProofConfigError";
  }
}

export function parseLocalEnv(text) {
  const values = {};

  for (const [index, originalLine] of String(text).split(/\r?\n/u).entries()) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const assignment = line.startsWith("export ") ? line.slice(7).trimStart() : line;
    const separator = assignment.indexOf("=");
    if (separator < 1) {
      throw new EmeraldProofConfigError(
        `Invalid local config assignment on line ${index + 1}`,
      );
    }

    const key = assignment.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      throw new EmeraldProofConfigError(`Invalid local config key on line ${index + 1}`);
    }

    let value = assignment.slice(separator + 1).trim();
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      if (value.length < 2 || value.at(-1) !== quote) {
        throw new EmeraldProofConfigError(`Unterminated quoted value on line ${index + 1}`);
      }
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function selectProofVariables(fileValues, environment) {
  return Object.fromEntries(
    EMERALD_PROOF_VARIABLES.flatMap((key) => {
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

export function buildEmeraldProofConfig(values, { projectRoot = process.cwd() } = {}) {
  const missing = REQUIRED_VARIABLES.filter((key) => !values[key]?.trim());
  if (missing.length > 0) {
    throw new EmeraldProofConfigError(
      `Missing required local configuration: ${missing.join(", ")}`,
    );
  }

  const portText = values.PORT?.trim() || "5173";
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new EmeraldProofConfigError("PORT must be an integer from 1 through 65535");
  }

  const pollIntervalText = values.EMERALD_MAPPING_POLL_INTERVAL_MS?.trim() || "250";
  const mappingPollIntervalMs = Number(pollIntervalText);
  if (!Number.isFinite(mappingPollIntervalMs) || mappingPollIntervalMs <= 0) {
    throw new EmeraldProofConfigError(
      "EMERALD_MAPPING_POLL_INTERVAL_MS must be a positive number",
    );
  }

  return Object.freeze({
    mgbaExecutable: resolveConfiguredPath(values.EOE_MGBA_EXE.trim(), projectRoot),
    emeraldRom: resolveConfiguredPath(values.EOE_EMERALD_ROM.trim(), projectRoot),
    emeraldSavestate: values.EOE_EMERALD_SAVESTATE?.trim()
      ? resolveConfiguredPath(values.EOE_EMERALD_SAVESTATE.trim(), projectRoot)
      : undefined,
    sourceSnapshot: resolveConfiguredPath(
      values.EMERALD_SOURCE_SNAPSHOT_PATH.trim(),
      projectRoot,
    ),
    liveState: resolveConfiguredPath(values.EOE_LIVE_STATE_PATH.trim(), projectRoot),
    mappingPollIntervalMs,
    port,
  });
}

export async function loadEmeraldProofConfig({
  configPath = resolve(EMERALD_PROOF_CONFIG_FILE),
  environment = process.env,
  projectRoot = process.cwd(),
  fileSystem = { readFile },
} = {}) {
  let text;
  try {
    text = await fileSystem.readFile(configPath, "utf8");
  } catch (error) {
    throw new EmeraldProofConfigError(
      `Could not read local config at ${configPath}. Create it from .env.local.example.`,
      { cause: error },
    );
  }

  return buildEmeraldProofConfig(selectProofVariables(parseLocalEnv(text), environment), {
    projectRoot,
  });
}

async function assertFile(path, label, fileSystem) {
  let details;
  try {
    details = await fileSystem.stat(path);
  } catch (error) {
    throw new EmeraldProofConfigError(`${label} does not exist: ${path}`, { cause: error });
  }
  if (!details.isFile()) {
    throw new EmeraldProofConfigError(`${label} must be a file: ${path}`);
  }
}

async function assertOutputPath(path, label, fileSystem) {
  try {
    const details = await fileSystem.stat(path);
    if (!details.isFile()) {
      throw new EmeraldProofConfigError(`${label} must be a file path: ${path}`);
    }
  } catch (error) {
    if (error instanceof EmeraldProofConfigError) {
      throw error;
    }
    if (error?.code !== "ENOENT") {
      throw new EmeraldProofConfigError(`Could not inspect ${label}: ${path}`, {
        cause: error,
      });
    }
  }
}

export async function validateEmeraldProofConfig(
  config,
  { fileSystem = { stat } } = {},
) {
  await assertFile(config.mgbaExecutable, "EOE_MGBA_EXE", fileSystem);
  await assertFile(config.emeraldRom, "EOE_EMERALD_ROM", fileSystem);
  if (config.emeraldSavestate) {
    await assertFile(config.emeraldSavestate, "EOE_EMERALD_SAVESTATE", fileSystem);
  }
  await assertOutputPath(
    config.sourceSnapshot,
    "EMERALD_SOURCE_SNAPSHOT_PATH",
    fileSystem,
  );
  await assertOutputPath(config.liveState, "EOE_LIVE_STATE_PATH", fileSystem);
  return true;
}

export async function prepareEmeraldProofDirectories(
  config,
  { fileSystem = { mkdir } } = {},
) {
  await fileSystem.mkdir(dirname(config.sourceSnapshot), { recursive: true });
  await fileSystem.mkdir(dirname(config.liveState), { recursive: true });
}

export function createMgbaLaunch(config, { environment = process.env } = {}) {
  return Object.freeze({
    executable: config.mgbaExecutable,
    args: Object.freeze([config.emeraldRom]),
    environment: Object.freeze({
      ...environment,
      EOE_MGBA_EXE: config.mgbaExecutable,
      EOE_EMERALD_ROM: config.emeraldRom,
      ...(config.emeraldSavestate
        ? { EOE_EMERALD_SAVESTATE: config.emeraldSavestate }
        : {}),
      EMERALD_SOURCE_SNAPSHOT_PATH: config.sourceSnapshot,
      EOE_LIVE_STATE_PATH: config.liveState,
      EMERALD_MAPPING_POLL_INTERVAL_MS: String(config.mappingPollIntervalMs),
      PORT: String(config.port),
    }),
  });
}
