const mode = process.argv[2] ?? "normal";
process.stdout.write('{"event":"ready","protocolVersion":"1.0.0"}\n');

process.stdin.setEncoding("utf8");
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const request = JSON.parse(line);
    if (mode === "hang") continue;
    if (mode === "crash") process.exit(23);
    if (mode === "abi-mismatch") {
      process.stdout.write(`${JSON.stringify({ id: request.id, ok: false, error: { code: "CORE_ABI_MISMATCH", message: "Core API 2 does not match 1" } })}\n`);
      continue;
    }
    if (request.op === "shutdown") {
      process.stdout.write(`${JSON.stringify({ id: request.id, ok: true, result: { callbacksUnregistered: 0 } })}\n`);
      setImmediate(() => process.exit(0));
      continue;
    }
    process.stdout.write(`${JSON.stringify({ id: request.id, ok: true, result: { op: request.op, params: request.params } })}\n`);
  }
});
