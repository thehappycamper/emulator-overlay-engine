// Single-command local proof session for the BizHawk Emerald acquisition
// path: launches BizHawk with the connector, the Emerald source-to-
// normalized-state mapper, and the overlay dev server, using the existing,
// already-reviewed BizHawk config/launch logic and the existing mapper/
// server scripts unchanged. Replaces manually coordinating
// `npm run proof:bizhawk`, `npm run live:emerald`, and `npm start` across
// three terminals; those individual commands still work unchanged for
// diagnostics/development.
//
// This file is deliberately thin: all BizHawk-specific config loading,
// validation, and launch-descriptor construction is reused from
// `bizhawk-proof-config.mjs` (unmodified); all process-lifecycle
// orchestration (readiness gating, log prefixing, port checking, signal
// handling, cascade termination) is reused from the emulator-agnostic
// `proof-session.mjs`. No Pokemon/Emerald semantics live in either shared
// module - only here, in the composition.

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  BIZHAWK_PROOF_CONFIG_FILE,
  createBizHawkLaunch,
  loadBizHawkProofConfig,
  prepareBizHawkProofDirectory,
  validateBizHawkProofConfig,
} from "./bizhawk-proof-config.mjs";
import { ProofSessionError, checkPortAvailable, runProofSession } from "./proof-session.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mapperScript = resolve(projectRoot, "tools", "emerald-live-state.mjs");
const serverScript = resolve(projectRoot, "tools", "dev-server.mjs");

export function readArguments(args) {
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

// Builds the three child-process specifications from an already-validated
// config. Pure/exported for direct testing without spawning anything: the
// only external inputs are the config object and the process's own
// executable path (for launching the mapper/server as Node scripts).
export function buildSessionChildren(config, { nodeExecutable = process.execPath } = {}) {
  const launch = createBizHawkLaunch(config);

  return [
    {
      id: "bizhawk",
      label: "bizhawk",
      command: launch.executable,
      args: launch.args,
      env: launch.environment,
      // BizHawk is a GUI application with no meaningful stdout of its own
      // (its Lua console writes to a GUI panel, not this process's
      // streams) - the only real signal available from outside the
      // process is that the OS actually started it. This is a disclosed
      // limitation, not a claim that the connector has loaded or that a
      // ROM is playable; see the task record.
      ready: "spawn",
      captureOutput: false,
    },
    {
      id: "mapper",
      label: "mapper",
      command: nodeExecutable,
      args: [mapperScript],
      env: launch.environment,
      ready: /^Watching Emerald source snapshot:/,
    },
    {
      id: "server",
      label: "server",
      command: nodeExecutable,
      args: [serverScript],
      env: launch.environment,
      ready: /running at http:\/\//,
    },
  ];
}

export async function runEmeraldBizHawkProofSession({
  argv = process.argv.slice(2),
  log = (line) => console.log(line),
  logError = (line) => console.error(line),
  environment = process.env,
  spawnFn,
  checkPortAvailableFn = checkPortAvailable,
} = {}) {
  const options = readArguments(argv);
  const config = await loadBizHawkProofConfig({
    configPath: options.configPath,
    projectRoot,
    environment,
  });
  await validateBizHawkProofConfig(config);

  const portAvailable = await checkPortAvailableFn(config.port);
  if (!portAvailable) {
    // Fail closed rather than silently choosing a different port: a URL
    // printed for a port the operator didn't configure would be a real
    // source of confusion, and PORT is already a one-line change in
    // .env.bizhawk.local if the operator wants a different one.
    throw new ProofSessionError(
      `Port ${config.port} is already in use. Free it, or set a different PORT in ${options.configPath}.`,
    );
  }

  log(`Local config is valid: ${options.configPath}`);
  log(`Supported BizHawk version: ${config.expectedBizHawkVersion}`);
  log(`Expected Emerald Rev 0 SHA-1: ${config.expectedRomHash}`);
  log(`Emerald source snapshot: ${config.sourceSnapshot}`);
  log(`Live state target: ${config.liveState}`);
  log(`Port ${config.port} is available.`);

  if (options.checkOnly) {
    log("Setup check complete; no processes were launched.");
    return null;
  }

  await prepareBizHawkProofDirectory(config);

  const children = buildSessionChildren(config);
  const session = await runProofSession(children, { log, logError, ...(spawnFn ? { spawnFn } : {}) });

  log("");
  log("Proof session is up:");
  log("  [bizhawk] launched (its own window/console carries further output, not this terminal)");
  log("  [mapper]  watching the Emerald source snapshot and publishing normalized state");
  log("  [server]  serving the overlay");
  log(`Overlay URL: http://127.0.0.1:${config.port}/?state=/public/live-state.json`);
  log("Press Ctrl+C to stop the entire session.");

  session.attachToProcessSignals();
  return session;
}

// `pathToFileURL` (not a manual "file://" + argv[1] string) is required for
// this comparison to work on Windows: argv[1] is a Windows-style path
// (backslashes, no URL scheme, no extra leading slash before the drive
// letter), which does not textually match import.meta.url's proper file://
// form. Verified to fail silently (no code below ever ran, no error either)
// with the naive string-concatenation version during manual testing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const session = await runEmeraldBizHawkProofSession();
    if (session) {
      const reason = await session.waitForExit();
      const clean = /^received SIG(INT|TERM)$/.test(reason ?? "");
      console.log(`Proof session ended: ${reason}`);
      process.exitCode = clean ? 0 : 1;
    }
  } catch (error) {
    console.error(`Emerald BizHawk proof session failed: ${error.message}`);
    process.exitCode = 1;
  }
}
