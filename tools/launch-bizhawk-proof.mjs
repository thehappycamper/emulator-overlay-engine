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
  console.log(`Diagnostic heartbeat: ${config.diagnosticPath}`);
  console.log("Watch that JSON file and confirm runtime.frame advances while the game runs.");
  console.log("");
  console.log("This bootstrap does not emit the mGBA-named Emerald source contract and does");
  console.log("not write public/live-state.json. Source-contract adaptation is the next P06 slice.");
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

  if (options.checkOnly) {
    console.log("Setup check complete; BizHawk was not launched.");
  } else {
    await launchBizHawk(createBizHawkLaunch(config));
    console.log("BizHawk launched with Emerald and the EOE proof connector.");
  }

  printNextSteps(config);
} catch (error) {
  console.error(`BizHawk Proof 2 setup failed: ${error.message}`);
  process.exitCode = 1;
}
