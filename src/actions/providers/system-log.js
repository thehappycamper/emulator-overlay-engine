// The system.log harmless local action provider (P04-T002). Delivers a
// level+message line to an injected sink - defaults to a console line when
// no sink is supplied, so this remains a genuinely local, no-file-I/O
// action by default.
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const schema = JSON.parse(readFileSync(new URL("./schemas/system-log-payload.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

export const systemLogProvider = Object.freeze({
  actionType: "system.log",
  requiredCapability: "system.log",

  validatePayload(payload) {
    if (!validate(payload)) {
      throw new TypeError(`system.log payload is invalid: ${ajv.errorsText(validate.errors)}`);
    }
  },

  // Same uniform "this execution context may run local harmless actions"
  // signal as overlay.notification - deliberately independent of the
  // executor-wide capability grant checked before this hook runs.
  authorize(_payload, context) {
    return context?.sessionAuthorized === true;
  },

  execute(payload, context) {
    const level = payload.level ?? "info";
    const log = typeof context?.log === "function" ? context.log : (lvl, message) => console.log(`[system.log:${lvl}] ${message}`);
    log(level, payload.message);
    return { logged: true, level, message: payload.message };
  },
});
