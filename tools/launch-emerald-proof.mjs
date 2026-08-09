import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  EMERALD_PROOF_CONFIG_FILE,
  createMgbaLaunch,
  loadEmeraldProofConfig,
  prepareEmeraldProofDirectories,
  validateEmeraldProofConfig,
} from "./emerald-proof-config.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readArguments(args) {
  const options = {
    checkOnly: false,
    configPath: resolve(projectRoot, EMERALD_PROOF_CONFIG_FILE),
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") {
      options.checkOnly = true;
    } else if (argument === "--config" && args[index + 1]) {
      options.configPath = resolve(args[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  return options;
}

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function printNextSteps(config) {
  const scriptPath = resolve(projectRoot, "adapters/gen3-mgba/emerald-acquisition.lua");
  console.log("");
  console.log("Complete the mGBA steps manually:");
  if (config.emeraldSavestate) {
    console.log(
      `1. Load the optional savestate through mGBA's UI: ${config.emeraldSavestate}`,
    );
  } else {
    console.log(
      "1. Start or load the desired in-game position (no savestate is configured).",
    );
  }
  console.log("2. Open Tools > Scripting..., choose Load script, and select:");
  console.log(`   ${scriptPath}`);
  console.log("3. Keep mGBA running. The Lua script will publish the source snapshot.");
  console.log("");
  console.log("In a second PowerShell terminal at the repository root:");
  console.log(
    `$env:EMERALD_SOURCE_SNAPSHOT_PATH = ${quotePowerShell(config.sourceSnapshot)}`,
  );
  console.log(`$env:EOE_LIVE_STATE_PATH = ${quotePowerShell(config.liveState)}`);
  console.log(
    `$env:EMERALD_MAPPING_POLL_INTERVAL_MS = ${quotePowerShell(config.mappingPollIntervalMs)}`,
  );
  console.log("npm run live:emerald");
  console.log("");
  console.log("In a third PowerShell terminal at the repository root:");
  console.log(`$env:PORT = ${quotePowerShell(config.port)}`);
  console.log("npm start");
  console.log(
    `Open http://127.0.0.1:${config.port}/?state=/public/live-state.json in a browser.`,
  );
}

async function launchMgba(launch) {
  const child = spawn(launch.executable, launch.args, {
    detached: true,
    env: launch.environment,
    stdio: "ignore",
    windowsHide: false,
  });

  await new Promise((resolveSpawn, rejectSpawn) => {
    child.once("spawn", resolveSpawn);
    child.once("error", rejectSpawn);
  });
  child.unref();
}

try {
  const options = readArguments(process.argv.slice(2));
  const config = await loadEmeraldProofConfig({
    configPath: options.configPath,
    projectRoot,
  });
  await validateEmeraldProofConfig(config);
  await prepareEmeraldProofDirectories(config);

  console.log(`Local config is valid: ${options.configPath}`);
  console.log(`Emerald source snapshot: ${config.sourceSnapshot}`);
  console.log(`Validated live state: ${config.liveState}`);

  if (options.checkOnly) {
    console.log("Setup check complete; mGBA was not launched.");
  } else {
    await launchMgba(createMgbaLaunch(config));
    console.log("mGBA launched with the configured Emerald ROM.");
  }

  printNextSteps(config);
} catch (error) {
  console.error(`Emerald Proof 1 setup failed: ${error.message}`);
  process.exitCode = 1;
}
