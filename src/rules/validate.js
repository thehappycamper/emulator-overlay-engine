import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const schema = JSON.parse(readFileSync(new URL("./schemas/rule.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validateRule = ajv.compile(schema);

export class RuleValidationError extends TypeError {
  constructor(errors) {
    super(`Rule failed validation: ${ajv.errorsText(errors)}`);
    this.name = "RuleValidationError";
    this.errors = structuredClone(errors ?? []);
  }
}

export function assertValidRule(rule) {
  if (!validateRule(rule)) throw new RuleValidationError(validateRule.errors);
  return true;
}
