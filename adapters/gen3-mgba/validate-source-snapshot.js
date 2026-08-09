import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

import {
  EMERALD_SOURCE_CONTRACT,
  createEmeraldSourceSnapshot,
} from "./emerald-source-contract.js";
import { readEmeraldAcquisition } from "./emerald-us-rev0.js";

const schema = JSON.parse(
  readFileSync(new URL("./schemas/emerald-us-rev0-source.schema.json", import.meta.url), "utf8"),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

export class EmeraldSourceSnapshotValidationError extends TypeError {
  constructor(errors) {
    super(
      `Invalid ${EMERALD_SOURCE_CONTRACT.id}@${EMERALD_SOURCE_CONTRACT.version} source snapshot: ${ajv.errorsText(errors)}`,
    );
    this.name = "EmeraldSourceSnapshotValidationError";
    this.errors = structuredClone(errors ?? []);
  }
}

export function assertValidEmeraldSourceSnapshot(snapshot) {
  if (!validate(snapshot)) {
    throw new EmeraldSourceSnapshotValidationError(validate.errors);
  }
  return true;
}

export function readValidatedEmeraldSourceSnapshot(identity, reader) {
  const snapshot = createEmeraldSourceSnapshot(identity, readEmeraldAcquisition(reader));
  assertValidEmeraldSourceSnapshot(snapshot);
  return snapshot;
}
