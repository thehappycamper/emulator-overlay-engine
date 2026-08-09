// Compatibility entry point for the original mGBA-owned module path.
import {
  EmeraldSourceSnapshotValidationError,
  assertValidEmeraldSourceSnapshot,
  readValidatedEmeraldSourceSnapshot as readProviderSnapshot,
} from "../pokemon-emerald-us-rev0/validate-source-snapshot.js";
import { MGBA_SOURCE } from "../pokemon-emerald-us-rev0/emerald-source-contract.js";

export { EmeraldSourceSnapshotValidationError, assertValidEmeraldSourceSnapshot };

export function readValidatedEmeraldSourceSnapshot(identity, reader) {
  return readProviderSnapshot(MGBA_SOURCE, identity, reader);
}
