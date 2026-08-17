// The overlay.notification harmless local action provider (P04-T002),
// extended (P04-T003) to deliver to a real local overlay notification feed.
// Delivers a message+severity to an injected sink - defaults to a console
// line when no sink is supplied, so this remains a genuinely local,
// no-I/O-required action unless a caller injects a real sink (see
// tools/emerald-live-state.mjs for the real wiring, and
// src/overlay/notification-feed.js for the delivery-side store this
// provider knows nothing about - it only ever calls the injected `notify`
// function).
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

  // async so a real sink can perform local I/O (e.g. writing the
  // notification feed file) and have a rejection genuinely propagate to the
  // executor's own try/catch, becoming a structured EXECUTION_FAILED result
  // rather than an unhandled rejection.
  async execute(payload, context) {
    const severity = payload.severity ?? "info";
    const notify = typeof context?.notify === "function"
      ? context.notify
      : (message, sev) => console.log(`[overlay.notification:${sev}] ${message}`);
    await notify(payload.message, severity);
    return { delivered: true, message: payload.message, severity };
  },
});
