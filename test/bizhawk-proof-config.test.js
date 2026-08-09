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
import {
  BIZHAWK_GBA_MEMORY_DOMAINS,
  translateGbaSystemBusAddress,
} from "../adapters/bizhawk/gba-memory-domains.js";
import { EMERALD_US_REV0 } from "../adapters/pokemon-emerald-us-rev0/emerald-us-rev0.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function values(overrides = {}) {
  return {
    EOE_BIZHAWK_EXE: "BizHawk 2.11.1/EmuHawk.exe",
    EOE_BIZHAWK_EMERALD_ROM: "games/Pokemon Emerald.gba",
    EMERALD_SOURCE_SNAPSHOT_PATH: "var/snapshots/bizhawk.source.json",
    EOE_LIVE_STATE_PATH: "public/live-state.json",
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

test("BizHawk config requires executable, ROM, source, and live-state paths", () => {
  assert.throws(
    () => buildBizHawkProofConfig({}, { projectRoot: "C:\\repo" }),
    /EOE_BIZHAWK_EXE.*EOE_BIZHAWK_EMERALD_ROM.*EMERALD_SOURCE_SNAPSHOT_PATH.*EOE_LIVE_STATE_PATH/,
  );
});

test("local config accepts supported environment overrides only", async () => {
  const config = await loadBizHawkProofConfig({
    configPath: "ignored.env.local",
    projectRoot: "C:\\repo",
    environment: {
      EMERALD_SOURCE_SNAPSHOT_PATH: "override/source.json",
      UNRELATED_SECRET: "do-not-copy",
    },
    fileSystem: {
      readFile: async () =>
        Object.entries(values())
          .map(([key, value]) => `${key}=${value}`)
          .join("\n"),
    },
  });

  assert.equal(config.sourceSnapshot, resolve("C:\\repo", "override/source.json"));
  assert.equal("UNRELATED_SECRET" in config, false);
});

test("path validation accepts local files and prepares the diagnostic directory", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bizhawk-proof-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "BizHawk 2.11.1"), { recursive: true });
  await mkdir(join(root, "games"), { recursive: true });
  await mkdir(join(root, "states"), { recursive: true });
  await mkdir(join(root, "adapters", "bizhawk"), { recursive: true });
  await mkdir(join(root, "adapters", "pokemon-emerald-us-rev0"), { recursive: true });
  await writeFile(join(root, "BizHawk 2.11.1", "EmuHawk.exe"), "test", "utf8");
  await writeFile(join(root, "games", "Pokemon Emerald.gba"), "test", "utf8");
  await writeFile(join(root, "states", "proof.State"), "test", "utf8");
  await writeFile(join(root, "adapters", "bizhawk", "proof-connector.lua"), "test", "utf8");
  await writeFile(
    join(root, "adapters", "pokemon-emerald-us-rev0", "emerald-acquisition.lua"),
    "test",
    "utf8",
  );

  const config = buildBizHawkProofConfig(
    values({ EOE_BIZHAWK_EMERALD_SAVESTATE: "states/proof.State" }),
    { projectRoot: root },
  );
  assert.equal(await validateBizHawkProofConfig(config), true);
  await prepareBizHawkProofDirectory(config);
  await writeFile(config.sourceSnapshot, "{}", "utf8");
  await mkdir(dirname(config.liveState), { recursive: true });
  await writeFile(config.liveState, "{}", "utf8");
  assert.equal(await validateBizHawkProofConfig(config), true);
});

test("missing executable, ROM, savestate, or connector fails before launch", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bizhawk-proof-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "BizHawk 2.11.1"), { recursive: true });
  await mkdir(join(root, "games"), { recursive: true });
  await mkdir(join(root, "adapters", "bizhawk"), { recursive: true });
  await mkdir(join(root, "adapters", "pokemon-emerald-us-rev0"), { recursive: true });

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
  await writeFile(
    join(root, "adapters", "pokemon-emerald-us-rev0", "emerald-acquisition.lua"),
    "test",
    "utf8",
  );
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
  assert.equal(launch.environment.EMERALD_SOURCE_SNAPSHOT_PATH, config.sourceSnapshot);
  assert.equal(launch.environment.EMERALD_ACQUISITION_MODULE_PATH, config.acquisitionModule);
  assert.equal(launch.environment.EOE_LIVE_STATE_PATH, config.liveState);
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

test("BizHawk connector stays provider-thin and verifies GBA memory domains", () => {
  const connector = readFileSync(
    join(repositoryRoot, "adapters", "bizhawk", "proof-connector.lua"),
    "utf8",
  );

  assert.match(connector, /client\.getversion\(\)/u);
  assert.match(connector, /emu\.getsystemid\(\)/u);
  assert.match(connector, /gameinfo\.getromhash\(\)/u);
  assert.match(connector, /memory\.getmemorydomainlist\(\)/u);
  assert.match(connector, /memory\.getmemorydomainsize\("System Bus"\)/u);
  assert.match(connector, /memory\.read_u8/u);
  assert.match(connector, /System Bus/u);
  assert.match(connector, /EWRAM/u);
  assert.match(connector, /IWRAM/u);
  assert.match(connector, /emu\.framecount\(\)/u);
  assert.match(connector, /emu\.frameadvance\(\)/u);
  assert.match(connector, /clearSourceSnapshot\(\)/u);
  assert.match(connector, /EMERALD_ACQUISITION_MODULE_PATH/u);
  assert.doesNotMatch(connector, /0x020244E9|GROWTH_SUBSTRUCT_INDEX/u);
});

test("known Emerald addresses translate to BizHawk direct WRAM offsets", () => {
  const widths = {
    battleTypeFlags: 4,
    playerPartyCount: 1,
    playerParty: 4,
    enemyParty: 4,
    mainInBattleFlags: 1,
    saveBlock1Pointer: 4,
  };
  for (const [name, address] of Object.entries(EMERALD_US_REV0.addresses)) {
    const translated = translateGbaSystemBusAddress(address, widths[name]);
    const expectedDomain = address < 0x03000000 ? "EWRAM" : "IWRAM";
    const expectedBase = BIZHAWK_GBA_MEMORY_DOMAINS[expectedDomain.toLowerCase()].base;
    assert.deepEqual(translated, {
      domain: expectedDomain,
      offset: address - expectedBase,
    });
  }
});

test("BizHawk WRAM translation rejects out-of-domain and crossing reads", () => {
  assert.throws(() => translateGbaSystemBusAddress(0x01000000, 1), RangeError);
  assert.throws(() => translateGbaSystemBusAddress(0x0203ffff, 2), RangeError);
  assert.throws(() => translateGbaSystemBusAddress(0x03007fff, 4), RangeError);
  assert.throws(() => translateGbaSystemBusAddress(0x02000000, 0), TypeError);
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
