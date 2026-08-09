import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ProviderError, PROTOCOL_VERSION } from "./protocol.mjs";

const defaultChild = resolve(dirname(fileURLToPath(import.meta.url)), "provider-child.mjs");

export class LibretroProviderClient {
  constructor({ childPath = defaultChild, timeoutMs = 5000, spawnImpl = spawn } = {}) {
    this.childPath = childPath;
    this.timeoutMs = timeoutMs;
    this.spawnImpl = spawnImpl;
    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = "";
    this.startPromise = null;
    this.exit = null;
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = new Promise((resolveReady, rejectReady) => {
      let settled = false;
      let startupTimer;
      let child;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        if (startupTimer) clearTimeout(startupTimer);
        if (child && child.exitCode === null) child.kill();
        rejectReady(error);
      };
      try {
        child = this.spawnImpl(process.execPath, [this.childPath], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      } catch (error) {
        fail(new ProviderError("STARTUP_FAILED", error.message));
        return;
      }
      this.child = child;
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => this.#onData(chunk, resolveReady, () => { settled = true; }));
      child.stderr.on("data", () => {});
      child.on("error", (error) => fail(new ProviderError("STARTUP_FAILED", error.message)));
      child.on("exit", (code, signal) => {
        this.exit = { code, signal };
        const error = new ProviderError("CHILD_EXITED", `Provider child exited (${code ?? signal})`, this.exit);
        for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
        this.pending.clear();
        fail(error);
      });
      startupTimer = setTimeout(() => fail(new ProviderError("STARTUP_TIMEOUT", "Provider child did not announce readiness")), this.timeoutMs);
    });
    return this.startPromise;
  }

  async request(op, params = {}) {
    await this.start();
    if (!this.child || this.child.exitCode !== null) throw new ProviderError("CHILD_EXITED", "Provider child is not running");
    const id = String(this.nextId++);
    return new Promise((resolveResponse, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new ProviderError("TIMEOUT", `Provider request timed out: ${op}`)); }, this.timeoutMs);
      this.pending.set(id, { resolve: resolveResponse, reject, timer });
      try { this.child.stdin.write(`${JSON.stringify({ id, op, params })}\n`); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(new ProviderError("CHILD_WRITE_FAILED", error.message)); }
    });
  }

  async shutdown() {
    if (!this.child || this.child.exitCode !== null) return;
    const child = this.child;
    try { await this.request("shutdown"); }
    finally {
      if (child.exitCode === null) {
        await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, this.timeoutMs))]);
        if (child.exitCode === null) child.kill();
      }
    }
  }

  #onData(chunk, resolveReady, markReady) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message.event === "ready") {
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          markReady();
          resolveReady(Promise.reject(new ProviderError("PROTOCOL_MISMATCH", "Unsupported provider protocol version")));
        } else { markReady(); resolveReady(this); }
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new ProviderError(message.error?.code, message.error?.message, message.error?.details));
    }
  }
}
