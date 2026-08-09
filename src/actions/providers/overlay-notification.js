// The overlay.notification harmless local action provider (P04-T002).
// Delivers a message to an injected sink - defaults to a console line when
// no sink is supplied, so this remains a genuinely local, no-I/O-required
// action by default. No overlay/UI wiring exists yet; this proves the
// executor boundary, not a real notification transport.
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const schema = JSON.parse(readFileSync(new URL("./schemas/overlay-notification-payload.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

export const overlayNotificationProvider = Object.freeze({
  actionType: "overlay.notification",
  requiredCapability: "overlay.notify",

  validatePayload(payload) {
    if (!validate(payload)) {
      throw new TypeError(`overlay.notification payload is invalid: ${ajv.errorsText(validate.errors)}`);
    }
  },

  // A deliberately simple, uniform authorization signal representing "this
  // execution context has been granted permission to run local harmless
  // actions" (e.g. a future operator setting) - distinct from the
  // executor-wide capability grant checked before this hook ever runs.
  authorize(_payload, context) {
    return context?.sessionAuthorized === true;
  },

  execute(payload, context) {
    const notify = typeof context?.notify === "function" ? context.notify : (message) => console.log(`[overlay.notification] ${message}`);
    notify(payload.message);
    return { delivered: true, message: payload.message };
  },
});
