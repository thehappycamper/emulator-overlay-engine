import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const eventSchema = JSON.parse(readFileSync(new URL("../events/schemas/event-envelope.schema.json", import.meta.url), "utf8"));
const requestSchema = JSON.parse(readFileSync(new URL("./schemas/action-request.schema.json", import.meta.url), "utf8"));
const resultSchema = JSON.parse(readFileSync(new URL("./schemas/action-result.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
ajv.addSchema(eventSchema);
const validateActionRequest = ajv.compile(requestSchema);
const validateActionResult = ajv.compile(resultSchema);

export class ActionRequestValidationError extends TypeError {
  constructor(errors) {
    super(`Action request failed validation: ${ajv.errorsText(errors)}`);
    this.name = "ActionRequestValidationError";
    this.errors = structuredClone(errors ?? []);
  }
}

export class ActionResultValidationError extends TypeError {
  constructor(errors) {
    super(`Action result failed validation: ${ajv.errorsText(errors)}`);
    this.name = "ActionResultValidationError";
    this.errors = structuredClone(errors ?? []);
  }
}

export function assertValidActionRequest(request) {
  if (!validateActionRequest(request)) throw new ActionRequestValidationError(validateActionRequest.errors);
  return true;
}

export function assertValidActionResult(result) {
  if (!validateActionResult(result)) throw new ActionResultValidationError(validateActionResult.errors);
  return true;
}
