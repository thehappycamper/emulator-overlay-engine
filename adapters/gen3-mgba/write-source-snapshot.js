import { writeJsonAtomically } from "./atomic-json-file.js";
import { assertValidEmeraldSourceSnapshot } from "./validate-source-snapshot.js";

export async function writeEmeraldSourceSnapshot(destination, snapshot, options = {}) {
  assertValidEmeraldSourceSnapshot(snapshot);
  return writeJsonAtomically(destination, snapshot, options);
}
