// A realistic (but koffi/native-core-free) stand-in for provider-child.mjs's
// own dispatch shape: the same lifecycle state machine (NOT_INITIALIZED
// gating), the same createSerialQueue() import, and the same "shuttingDown
// blocks the door synchronously" pattern - with configurable artificial
// per-request delays so races that *would* occur without serialization are
// reliably reproducible over real child-process IPC, without needing a real
// Libretro core or ROM. Every handled request is appended to an in-memory
// log with start/end timestamps, retrievable via the "inspectLog" op, so
// tests can directly assert that no two logged intervals overlap.
import { createInterface } from "node:readline";
import { assertRequest, errorPayload, ProviderError, PROTOCOL_VERSION } from "../protocol.mjs";
import { createSerialQueue } from "../request-queue.mjs";

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

let initialized = false;
let shuttingDown = false;
const log = [];

async function handle(request) {
  assertRequest(request);
  const entry = { op: request.op, start: Date.now(), end: null };
  log.push(entry);
  try {
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
      case "read": {
        if (!initialized) throw new ProviderError("NOT_INITIALIZED", "Not initialized");
        await delay(request.params?.delayMs ?? 0);
        return { value: request.params?.index ?? 0 };
      }
      case "fail": {
        await delay(request.params?.delayMs ?? 0);
        throw new ProviderError("SIMULATED_FAILURE", "Simulated request-level failure");
      }
      case "inspectLog": {
        return { log: log.map((item) => ({ ...item })) };
      }
      case "shutdown": {
        await delay(request.params?.delayMs ?? 10);
        initialized = false;
        return { shutdown: true };
      }
      default:
        throw new ProviderError("UNKNOWN_OPERATION", `Unknown operation ${request.op}`);
    }
  } finally {
    entry.end = Date.now();
  }
}

const queue = createSerialQueue();

async function processOne(request) {
  try {
    const result = await handle(request);
    send({ id: request.id, ok: true, result });
    if (request?.op === "shutdown") setImmediate(() => process.exit(0));
  } catch (error) {
    send({ id: request?.id ?? null, ok: false, error: errorPayload(error) });
  }
}

send({ event: "ready", protocolVersion: PROTOCOL_VERSION });
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  let request = null;
  try { request = JSON.parse(line); } catch { /* surfaced as MALFORMED_REQUEST by assertRequest inside handle() */ }

  if (shuttingDown) {
    const id = request && typeof request === "object" && typeof request.id === "string" ? request.id : null;
    send({
      id,
      ok: false,
      error: errorPayload(new ProviderError("PROVIDER_SHUTTING_DOWN", "Provider is shutting down and cannot accept further requests")),
    });
    return;
  }

  if (request && typeof request === "object" && request.op === "shutdown") {
    shuttingDown = true;
  }

  queue.enqueue(() => processOne(request));
});
