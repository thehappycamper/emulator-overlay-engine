import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BizHawkProofConfigError,
  EMERALD_US_REV0_SHA1,
  SUPPORTED_BIZHAWK_VERSION,
  buildBizHawkProofConfig,
  createBizHawkLaunch,
  loadBizHawkProofConfig,
  prepareBizHawkProofDirectory,
  validateBizHawkProofConfig,
} from "../tools/bizhawk-proof-config.mjs";
import { LocalConfigError, parseLocalEnv } from "../tools/local-env.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function values(overrides = {}) {
  return {
    EOE_BIZHAWK_EXE: "BizHawk 2.11.1/EmuHawk.exe",
    EOE_BIZHAWK_EMERALD_ROM: "games/Pokemon Emerald.gba",
    BIZHAWK_CONNECTOR_DIAGNOSTIC_PATH: "var/snapshots/bizhawk.json",
    ...overrides,
  };
}

test("shared local env parser treats values as data rather than shell expressions", () => {
  assert.deepEqual(
    parseLocalEnv(`
# local only
export EOE_BIZHAWK_EXE="C:\\Emulators\\BizHawk 2.11.1\\EmuHawk.exe"
EOE_BIZHAWK_EMERALD_ROM='C:\\Games\\Pokemon Emerald.gba'
LITERAL=$HOME/not-expanded
`),
    {
      EOE_BIZHAWK_EXE: "C:\\Emulators\\BizHawk 2.11.1\\EmuHawk.exe",
      EOE_BIZHAWK_EMERALD_ROM: "C:\\Games\\Pokemon Emerald.gba",
      LITERAL: "$HOME/not-expanded",
    },
  );
  assert.throws(() => parseLocalEnv("NOT_AN_ASSIGNMENT"), LocalConfigError);
});

test("BizHawk config requires executable, ROM, and diagnostic paths", () => {
  assert.throws(
    () => buildBizHawkProofConfig({}, { projectRoot: "C:\\repo" }),
    /EOE_BIZHAWK_EXE.*EOE_BIZHAWK_EMERALD_ROM.*BIZHAWK_CONNECTOR_DIAGNOSTIC_PATH/,
  );
});

test("local config accepts supported environment overrides only", async () => {
  const config = await loadBizHawkProofConfig({
    configPath: "ignored.env.local",
    projectRoot: "C:\\repo",
    environment: {
      BIZHAWK_CONNECTOR_DIAGNOSTIC_PATH: "override/diagnostic.json",
      UNRELATED_SECRET: "do-not-copy",
    },
    fileSystem: {
      readFile: async () =>
        Object.entries(values())
          .map(([key, value]) => `${key}=${value}`)
          .join("\n"),
    },
  });

  assert.equal(config.diagnosticPath, resolve("C:\\repo", "override/diagnostic.json"));
  assert.equal("UNRELATED_SECRET" in config, false);
});

test("path validation accepts local files and prepares the diagnostic directory", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bizhawk-proof-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "BizHawk 2.11.1"), { recursive: true });
  await mkdir(join(root, "games"), { recursive: true });
  await mkdir(join(root, "states"), { recursive: true });
  await mkdir(join(root, "adapters", "bizhawk"), { recursive: true });
  await writeFile(join(root, "BizHawk 2.11.1", "EmuHawk.exe"), "test", "utf8");
  await writeFile(join(root, "games", "Pokemon Emerald.gba"), "test", "utf8");
  await writeFile(join(root, "states", "proof.State"), "test", "utf8");
  await writeFile(join(root, "adapters", "bizhawk", "proof-connector.lua"), "test", "utf8");

  const config = buildBizHawkProofConfig(
    values({ EOE_BIZHAWK_EMERALD_SAVESTATE: "states/proof.State" }),
    { projectRoot: root },
  );
  assert.equal(await validateBizHawkProofConfig(config), true);
  await prepareBizHawkProofDirectory(config);
  await writeFile(config.diagnosticPath, "{}", "utf8");
  assert.equal(await validateBizHawkProofConfig(config), true);
});

test("missing executable, ROM, savestate, or connector fails before launch", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bizhawk-proof-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "BizHawk 2.11.1"), { recursive: true });
  await mkdir(join(root, "games"), { recursive: true });
  await mkdir(join(root, "adapters", "bizhawk"), { recursive: true });

  await assert.rejects(
    () => validateBizHawkProofConfig(buildBizHawkProofConfig(values(), { projectRoot: root })),
    /EOE_BIZHAWK_EXE does not exist/,
  );

  await writeFile(join(root, "BizHawk 2.11.1", "EmuHawk.exe"), "test", "utf8");
  await assert.rejects(
    () => validateBizHawkProofConfig(buildBizHawkProofConfig(values(), { projectRoot: root })),
    /EOE_BIZHAWK_EMERALD_ROM does not exist/,
  );

  await writeFile(join(root, "games", "Pokemon Emerald.gba"), "test", "utf8");
  await assert.rejects(
    () => validateBizHawkProofConfig(buildBizHawkProofConfig(values(), { projectRoot: root })),
    /BizHawk proof connector does not exist/,
  );

  await writeFile(join(root, "adapters", "bizhawk", "proof-connector.lua"), "test", "utf8");
  await assert.rejects(
    () =>
      validateBizHawkProofConfig(
        buildBizHawkProofConfig(
          values({ EOE_BIZHAWK_EMERALD_SAVESTATE: "states/missing.State" }),
          { projectRoot: root },
        ),
      ),
    /EOE_BIZHAWK_EMERALD_SAVESTATE does not exist/,
  );
});

test("BizHawk launch auto-loads connector and keeps the ROM as the final argument", () => {
  const config = buildBizHawkProofConfig(
    values({ EOE_BIZHAWK_EMERALD_SAVESTATE: "states/proof.State" }),
    { projectRoot: "C:\\repo with spaces" },
  );
  const launch = createBizHawkLaunch(config, { environment: { SYSTEM_VALUE: "kept" } });

  assert.equal(launch.executable, config.bizhawkExecutable);
  assert.deepEqual(launch.args, [
    `--lua=${config.connectorPath}`,
    `--load-state=${config.emeraldSavestate}`,
    config.emeraldRom,
  ]);
  assert.equal(launch.args.at(-1), config.emeraldRom);
  assert.equal(launch.environment.BIZHAWK_CONNECTOR_DIAGNOSTIC_PATH, config.diagnosticPath);
  assert.equal(launch.environment.BIZHAWK_EXPECTED_VERSION, SUPPORTED_BIZHAWK_VERSION);
  assert.equal(launch.environment.BIZHAWK_EXPECTED_SYSTEM_ID, "GBA");
  assert.equal(launch.environment.BIZHAWK_EXPECTED_ROM_HASH, EMERALD_US_REV0_SHA1);
  assert.equal(launch.environment.SYSTEM_VALUE, "kept");
});

test("BizHawk launch omits load-state when no savestate is configured", () => {
  const config = buildBizHawkProofConfig(values(), { projectRoot: "C:\\repo" });
  const launch = createBizHawkLaunch(config);

  assert.deepEqual(launch.args, [`--lua=${config.connectorPath}`, config.emeraldRom]);
  assert.equal(launch.args.some((argument) => argument.startsWith("--load-state")), false);
});

test("BizHawk connector stays emulator-generic and fails closed on supplied identity", () => {
  const connector = readFileSync(
    join(repositoryRoot, "adapters", "bizhawk", "proof-connector.lua"),
    "utf8",
  );

  assert.match(connector, /client\.getversion\(\)/u);
  assert.match(connector, /emu\.getsystemid\(\)/u);
  assert.match(connector, /gameinfo\.getromhash\(\)/u);
  assert.match(connector, /emu\.framecount\(\)/u);
  assert.match(connector, /emu\.frameadvance\(\)/u);
  assert.match(connector, /error\(mismatch\)/u);
  assert.doesNotMatch(connector, /\b(?:pokemon|party|species|battle|move|type)\b/iu);
  assert.doesNotMatch(connector, /\bmemory\./u);
});

test("malformed BizHawk local config reports a task-specific deterministic error", async () => {
  await assert.rejects(
    () =>
      loadBizHawkProofConfig({
        configPath: "ignored",
        fileSystem: { readFile: async () => "NOT_AN_ASSIGNMENT" },
      }),
    BizHawkProofConfigError,
  );
});
