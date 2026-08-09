import { EMERALD_US_REV0, assertSupportedEmeraldIdentity } from "./emerald-us-rev0.js";

export const EMERALD_SOURCE_CONTRACT = Object.freeze({
  id: "pokemon.emerald.us-rev0.acquisition",
  version: "1.0.0",
  schemaId: "urn:source-contract:pokemon.emerald.us-rev0.acquisition:1.0.0",
});

export const MGBA_SOURCE = Object.freeze({
  provider: Object.freeze({ id: "mgba", name: "mGBA" }),
  integration: "lua",
  memory: Object.freeze({
    addressSpace: "gba-system-bus",
    primaryDomain: "mGBA emu API",
    verifiedDomains: Object.freeze([]),
  }),
});

export const BIZHAWK_SOURCE = Object.freeze({
  provider: Object.freeze({ id: "bizhawk", name: "BizHawk", version: "2.11.1" }),
  integration: "lua",
  memory: Object.freeze({
    addressSpace: "gba-system-bus",
    primaryDomain: "System Bus",
    verifiedDomains: Object.freeze(["EWRAM", "IWRAM"]),
  }),
});

function freezePokemon(value) {
  return value === null ? null : Object.freeze({ ...value });
}

function freezeSource(source) {
  if (!source?.provider || !source?.memory) {
    throw new TypeError("Emerald source provenance must identify a provider and memory space");
  }
  return Object.freeze({
    provider: Object.freeze({ ...source.provider }),
    integration: source.integration,
    memory: Object.freeze({
      ...source.memory,
      verifiedDomains: Object.freeze([...(source.memory.verifiedDomains ?? [])]),
    }),
  });
}

export function createEmeraldSourceSnapshot(source, identity, acquisition) {
  assertSupportedEmeraldIdentity(identity);

  return Object.freeze({
    contract: Object.freeze({
      id: EMERALD_SOURCE_CONTRACT.id,
      version: EMERALD_SOURCE_CONTRACT.version,
    }),
    source: freezeSource(source),
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
