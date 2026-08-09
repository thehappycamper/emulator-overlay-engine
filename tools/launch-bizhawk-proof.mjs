import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BIZHAWK_PROOF_CONFIG_FILE,
  createBizHawkLaunch,
  loadBizHawkProofConfig,
  prepareBizHawkProofDirectory,
  validateBizHawkProofConfig,
} from "./bizhawk-proof-config.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function readArguments(args) {
  const options = {
    checkOnly: false,
    configPath: resolve(projectRoot, BIZHAWK_PROOF_CONFIG_FILE),
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

async function launchBizHawk(launch) {
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

function printNextSteps(config) {
  console.log("");
  console.log("BizHawk loads the repository connector automatically through --lua.");
  console.log(
    config.emeraldSavestate
      ? `The configured savestate also loads automatically: ${config.emeraldSavestate}`
      : "No savestate is configured; BizHawk starts from the ROM's normal boot.",
  );
  console.log(`Shared Emerald source snapshot: ${config.sourceSnapshot}`);
  console.log("The connector compares System Bus reads with direct EWRAM/IWRAM reads");
  console.log("before it publishes the shared Emerald acquisition contract.");
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

try {
  const options = readArguments(process.argv.slice(2));
  const config = await loadBizHawkProofConfig({
    configPath: options.configPath,
    projectRoot,
  });
  await validateBizHawkProofConfig(config);
  await prepareBizHawkProofDirectory(config);

  console.log(`Local config is valid: ${options.configPath}`);
  console.log(`Supported BizHawk version: ${config.expectedBizHawkVersion}`);
  console.log(`Expected Emerald Rev 0 SHA-1: ${config.expectedRomHash}`);
  console.log(`Emerald source snapshot: ${config.sourceSnapshot}`);
  console.log(`Validated live state: ${config.liveState}`);

  if (options.checkOnly) {
    console.log("Setup check complete; BizHawk was not launched.");
  } else {
    await launchBizHawk(createBizHawkLaunch(config));
    console.log("BizHawk launched with Emerald and the EOE acquisition connector.");
  }

  printNextSteps(config);
} catch (error) {
  console.error(`BizHawk Proof 2 setup failed: ${error.message}`);
  process.exitCode = 1;
}
