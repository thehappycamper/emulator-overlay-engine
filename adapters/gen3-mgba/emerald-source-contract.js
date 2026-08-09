import { EMERALD_US_REV0, assertSupportedEmeraldIdentity } from "./emerald-us-rev0.js";

export const EMERALD_SOURCE_CONTRACT = Object.freeze({
  id: "pokemon.emerald.us-rev0.mgba.acquisition",
  version: "1.0.0",
  schemaId: "urn:source-contract:pokemon.emerald.us-rev0.mgba.acquisition:1.0.0",
});

function freezePokemon(value) {
  return value === null ? null : Object.freeze({ ...value });
}

export function createEmeraldSourceSnapshot(identity, acquisition) {
  assertSupportedEmeraldIdentity(identity);

  return Object.freeze({
    contract: Object.freeze({
      id: EMERALD_SOURCE_CONTRACT.id,
      version: EMERALD_SOURCE_CONTRACT.version,
    }),
    game: Object.freeze({
      gameCode: EMERALD_US_REV0.identity.gameCode,
      title: EMERALD_US_REV0.identity.title,
      revision: EMERALD_US_REV0.identity.revision,
      crc32: EMERALD_US_REV0.identity.crc32,
    }),
    party: Object.freeze({
      count: acquisition?.party?.count,
      first: freezePokemon(acquisition?.party?.first ?? null),
    }),
    battle: Object.freeze({
      active: acquisition?.battle?.active,
      typeFlags: acquisition?.battle?.typeFlags,
      opponent: freezePokemon(acquisition?.battle?.opponent ?? null),
    }),
    location:
      acquisition?.location === null || acquisition?.location === undefined
        ? null
        : Object.freeze({ ...acquisition.location }),
  });
}
