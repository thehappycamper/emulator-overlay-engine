import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const eventEnvelopeSchemaUrl = new URL("./schemas/event-envelope.schema.json", import.meta.url);

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateEventEnvelope = ajv.compile(readJson(eventEnvelopeSchemaUrl));

export class EventValidationError extends TypeError {
  constructor(errors) {
    super(`Semantic event failed validation: ${ajv.errorsText(errors)}`);
    this.name = "EventValidationError";
    this.errors = structuredClone(errors ?? []);
  }
}

export function assertValidEvent(event) {
  if (!validateEventEnvelope(event)) {
    throw new EventValidationError(validateEventEnvelope.errors);
  }
  return true;
}
