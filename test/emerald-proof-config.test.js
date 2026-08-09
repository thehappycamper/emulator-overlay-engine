import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EmeraldProofConfigError,
  buildEmeraldProofConfig,
  createMgbaLaunch,
  loadEmeraldProofConfig,
  parseLocalEnv,
  prepareEmeraldProofDirectories,
  validateEmeraldProofConfig,
} from "../tools/emerald-proof-config.mjs";

function values(overrides = {}) {
  return {
    EOE_MGBA_EXE: "bin/mGBA.exe",
    EOE_EMERALD_ROM: "games/emerald.gba",
    EMERALD_SOURCE_SNAPSHOT_PATH: "var/snapshots/source.json",
    EOE_LIVE_STATE_PATH: "public/live-state.json",
    ...overrides,
  };
}

test("local env parser handles comments, exports, spaces, and quoted values without execution", () => {
  assert.deepEqual(
    parseLocalEnv(`
# local only
export EOE_MGBA_EXE=C:\\Apps\\mGBA\\mGBA.exe
EOE_EMERALD_ROM="C:\\Games\\Pokemon Emerald.gba"
EOE_EMERALD_SAVESTATE='C:\\Saves\\proof.ss1'
LITERAL=$HOME/not-expanded
`),
    {
      EOE_MGBA_EXE: "C:\\Apps\\mGBA\\mGBA.exe",
      EOE_EMERALD_ROM: "C:\\Games\\Pokemon Emerald.gba",
      EOE_EMERALD_SAVESTATE: "C:\\Saves\\proof.ss1",
      LITERAL: "$HOME/not-expanded",
    },
  );
});

test("local env parser rejects malformed and unterminated assignments", () => {
  assert.throws(() => parseLocalEnv("NOT_AN_ASSIGNMENT"), EmeraldProofConfigError);
  assert.throws(() => parseLocalEnv('EOE_MGBA_EXE="unfinished'), /Unterminated quoted value/);
});

test("config construction enforces required values and local numeric settings", () => {
  assert.throws(
    () => buildEmeraldProofConfig({}, { projectRoot: "C:\\repo" }),
    /EOE_MGBA_EXE.*EOE_EMERALD_ROM.*EMERALD_SOURCE_SNAPSHOT_PATH.*EOE_LIVE_STATE_PATH/,
  );
  assert.throws(
    () => buildEmeraldProofConfig(values({ PORT: "70000" })),
    /PORT must be an integer/,
  );
  assert.throws(
    () => buildEmeraldProofConfig(values({ EMERALD_MAPPING_POLL_INTERVAL_MS: "0" })),
    /must be a positive number/,
  );
});

test("local config loads supported environment overrides without exposing unrelated keys", async () => {
  const config = await loadEmeraldProofConfig({
    configPath: "ignored.env.local",
    projectRoot: "C:\\repo",
    environment: { PORT: "6123", UNRELATED_SECRET: "do-not-copy" },
    fileSystem: {
      readFile: async () =>
        Object.entries(values())
          .map(([key, value]) => `${key}=${value}`)
          .join("\n"),
    },
  });

  assert.equal(config.port, 6123);
  assert.equal("UNRELATED_SECRET" in config, false);
});

test("path validation and setup accept real files and create both output directories", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "emerald-proof-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "bin"), { recursive: true });
  await mkdir(join(root, "games"), { recursive: true });
  await mkdir(join(root, "saves"), { recursive: true });
  await mkdir(join(root, "adapters", "pokemon-emerald-us-rev0"), { recursive: true });
  await writeFile(join(root, "bin", "mGBA.exe"), "test", "utf8");
  await writeFile(join(root, "games", "emerald.gba"), "test", "utf8");
  await writeFile(join(root, "saves", "proof.ss1"), "test", "utf8");
  await writeFile(
    join(root, "adapters", "pokemon-emerald-us-rev0", "emerald-acquisition.lua"),
    "test",
    "utf8",
  );

  const config = buildEmeraldProofConfig(
    values({ EOE_EMERALD_SAVESTATE: "saves/proof.ss1" }),
    { projectRoot: root },
  );
  assert.equal(await validateEmeraldProofConfig(config), true);
  await prepareEmeraldProofDirectories(config);

  await writeFile(config.sourceSnapshot, "{}", "utf8");
  await writeFile(config.liveState, "{}", "utf8");
  assert.equal(await validateEmeraldProofConfig(config), true);
});

test("missing executable, ROM, or configured savestate fails before launch", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "emerald-proof-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "bin"), { recursive: true });
  await mkdir(join(root, "games"), { recursive: true });

  const missingExecutable = buildEmeraldProofConfig(values(), { projectRoot: root });
  await assert.rejects(
    () => validateEmeraldProofConfig(missingExecutable),
    /EOE_MGBA_EXE does not exist/,
  );

  await writeFile(join(root, "bin", "mGBA.exe"), "test", "utf8");
  const missingRom = buildEmeraldProofConfig(values(), { projectRoot: root });
  await assert.rejects(
    () => validateEmeraldProofConfig(missingRom),
    /EOE_EMERALD_ROM does not exist/,
  );

  await writeFile(join(root, "games", "emerald.gba"), "test", "utf8");
  const missingSavestate = buildEmeraldProofConfig(
    values({ EOE_EMERALD_SAVESTATE: "saves/missing.ss1" }),
    { projectRoot: root },
  );
  await assert.rejects(
    () => validateEmeraldProofConfig(missingSavestate),
    /EOE_EMERALD_SAVESTATE does not exist/,
  );
});

test("mGBA launch preserves the ROM argument and exports proof settings to the child", () => {
  const config = buildEmeraldProofConfig(values({ PORT: "6000" }), {
    projectRoot: "C:\\repo",
  });
  const launch = createMgbaLaunch(config, { environment: { SYSTEM_VALUE: "kept" } });

  assert.equal(launch.executable, config.mgbaExecutable);
  assert.deepEqual(launch.args, [config.emeraldRom]);
  assert.equal(launch.environment.EMERALD_SOURCE_SNAPSHOT_PATH, config.sourceSnapshot);
  assert.equal(launch.environment.EMERALD_ACQUISITION_MODULE_PATH, config.acquisitionModule);
  assert.equal(launch.environment.EOE_LIVE_STATE_PATH, config.liveState);
  assert.equal(launch.environment.PORT, "6000");
  assert.equal(launch.environment.SYSTEM_VALUE, "kept");
});

test("mGBA launch passes a configured savestate via mgba-qt's documented --savestate flag", () => {
  const config = buildEmeraldProofConfig(
    values({ EOE_EMERALD_SAVESTATE: "saves/proof.ss1" }),
    { projectRoot: "C:\\repo" },
  );
  const launch = createMgbaLaunch(config);

  assert.deepEqual(launch.args, [config.emeraldRom, "--savestate", config.emeraldSavestate]);
});

test("mGBA launch omits --savestate entirely when no savestate is configured", () => {
  const config = buildEmeraldProofConfig(values(), { projectRoot: "C:\\repo" });
  const launch = createMgbaLaunch(config);

  assert.deepEqual(launch.args, [config.emeraldRom]);
  assert.equal(launch.args.includes("--savestate"), false);
});
