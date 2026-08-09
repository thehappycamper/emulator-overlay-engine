// The ORIGINAL (pre-fix) dispatch pattern from provider-child.mjs: each
// "line" event runs an independent async listener with no serialization.
// This fixture exists only so the test suite can demonstrate that its own
// ordering assertions are non-vacuous - i.e. that they genuinely fail
// against the unserialized pattern the real fix replaces, not just pass
// trivially regardless of implementation.
import { createInterface } from "node:readline";
import { assertRequest, errorPayload, ProviderError, PROTOCOL_VERSION } from "../protocol.mjs";

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

let initialized = false;
let closing = false;

async function handle(request) {
  assertRequest(request);
  switch (request.op) {
    case "initialize": {
      if (initialized) throw new ProviderError("ALREADY_INITIALIZED", "Already initialized");
      await delay(request.params?.delayMs ?? 20);
      initialized = true;
      return { initialized: true };
    }
    case "run": {
      if (!initialized) throw new ProviderError("NOT_INITIALIZED", "Not initialized");
      await delay(request.params?.delayMs ?? 0);
      return { ran: true };
    }
    case "shutdown": {
      const result = { shutdown: true };
      closing = true;
      return result;
    }
    default:
      throw new ProviderError("UNKNOWN_OPERATION", `Unknown operation ${request.op}`);
  }
}

send({ event: "ready", protocolVersion: PROTOCOL_VERSION });
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", async (line) => {
  if (closing) return;
  let request;
  try { request = JSON.parse(line); }
  catch { send({ id: null, ok: false, error: errorPayload(new ProviderError("MALFORMED_REQUEST", "Request is not valid JSON")) }); return; }
  try {
    const result = await handle(request);
    send({ id: request.id, ok: true, result });
    if (request.op === "shutdown") setImmediate(() => process.exit(0));
  } catch (error) {
    send({ id: request?.id ?? null, ok: false, error: errorPayload(error) });
  }
});
