// Compatibility entry point for P05 consumers. New code should import the
// provider-neutral contract from adapters/pokemon-emerald-us-rev0.
import {
  EMERALD_SOURCE_CONTRACT,
  MGBA_SOURCE,
  createEmeraldSourceSnapshot as createProviderSnapshot,
} from "../pokemon-emerald-us-rev0/emerald-source-contract.js";

export { EMERALD_SOURCE_CONTRACT, MGBA_SOURCE };

export function createEmeraldSourceSnapshot(identity, acquisition) {
  return createProviderSnapshot(MGBA_SOURCE, identity, acquisition);
}
