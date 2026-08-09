const GROWTH_SUBSTRUCT_INDEX = Object.freeze([
  0, 0, 0, 0, 0, 0,
  1, 1, 2, 3, 2, 3,
  1, 1, 2, 3, 2, 3,
  1, 1, 2, 3, 2, 3,
]);

export const EMERALD_US_REV0 = Object.freeze({
  identity: Object.freeze({
    gameCode: "AGB-BPEE",
    title: "POKEMON EMER",
    revision: 0,
    crc32: "1F1C08FB",
    sha1: "f3ae088181bf583e55daf962a92bb46f4f1d07b7",
  }),
  addresses: Object.freeze({
    battleTypeFlags: 0x02022fec,
    playerPartyCount: 0x020244e9,
    playerParty: 0x020244ec,
    enemyParty: 0x02024744,
    mainInBattleFlags: 0x030026f9,
    saveBlock1Pointer: 0x03005d8c,
  }),
  pokemon: Object.freeze({
    structSize: 100,
    secureDataOffset: 32,
    substructSize: 12,
    levelOffset: 84,
    currentHpOffset: 86,
    maxHpOffset: 88,
  }),
  saveBlock1: Object.freeze({
    ewramStart: 0x02000000,
    ewramEnd: 0x02040000,
    positionXOffset: 0,
    positionYOffset: 2,
    mapGroupOffset: 4,
    mapNumberOffset: 5,
  }),
});

function requireReader(reader) {
  for (const method of ["read8", "read16", "read32"]) {
    if (typeof reader?.[method] !== "function") {
      throw new TypeError(`Memory reader must provide ${method}(address)`);
    }
  }
}

function readUnsigned(reader, method, address, maximum) {
  const value = reader[method](address);
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${method} returned an invalid value at 0x${address.toString(16)}`);
  }
  return value;
}

function signed16(value) {
  return value >= 0x8000 ? value - 0x10000 : value;
}

export function assertSupportedEmeraldIdentity(identity) {
  const expected = EMERALD_US_REV0.identity;
  const actualCrc32 = String(identity?.crc32 ?? "").toUpperCase();
  if (
    identity?.gameCode !== expected.gameCode ||
    identity?.title !== expected.title ||
    identity?.revision !== expected.revision ||
    actualCrc32 !== expected.crc32
  ) {
    throw new RangeError(
      `Unsupported Emerald ROM: expected ${expected.gameCode} Rev ${expected.revision} CRC32 ${expected.crc32}`,
    );
  }
  return true;
}

export function growthSubstructIndex(personality) {
  if (!Number.isInteger(personality) || personality < 0 || personality > 0xffffffff) {
    throw new RangeError("Pokemon personality must be an unsigned 32-bit integer");
  }
  return GROWTH_SUBSTRUCT_INDEX[personality % 24];
}

export function decodeGen3Pokemon(reader, address) {
  requireReader(reader);
  if (!Number.isInteger(address) || address < 0 || address > 0xffffffff) {
    throw new RangeError("Pokemon address must be an unsigned 32-bit integer");
  }

  const layout = EMERALD_US_REV0.pokemon;
  const personality = readUnsigned(reader, "read32", address, 0xffffffff);
  const otId = readUnsigned(reader, "read32", address + 4, 0xffffffff);
  const growthAddress =
    address +
    layout.secureDataOffset +
    growthSubstructIndex(personality) * layout.substructSize;
  const encryptedGrowthWord = readUnsigned(reader, "read32", growthAddress, 0xffffffff);
  const decryptedGrowthWord = (encryptedGrowthWord ^ personality ^ otId) >>> 0;

  return Object.freeze({
    speciesId: decryptedGrowthWord & 0xffff,
    level: readUnsigned(reader, "read8", address + layout.levelOffset, 0xff),
    currentHp: readUnsigned(reader, "read16", address + layout.currentHpOffset, 0xffff),
    maxHp: readUnsigned(reader, "read16", address + layout.maxHpOffset, 0xffff),
  });
}

export function readEmeraldAcquisition(reader) {
  requireReader(reader);
  const { addresses, saveBlock1 } = EMERALD_US_REV0;
  const partyCount = readUnsigned(reader, "read8", addresses.playerPartyCount, 0xff);
  if (partyCount > 6) {
    throw new RangeError(`Invalid Emerald party count: ${partyCount}`);
  }

  const inBattleFlags = readUnsigned(reader, "read8", addresses.mainInBattleFlags, 0xff);
  const battleActive = (inBattleFlags & 0x02) !== 0;
  const saveBlock1Address = readUnsigned(reader, "read32", addresses.saveBlock1Pointer, 0xffffffff);
  const locationReadable =
    saveBlock1Address >= saveBlock1.ewramStart &&
    saveBlock1Address + saveBlock1.mapNumberOffset < saveBlock1.ewramEnd;

  return Object.freeze({
    party: Object.freeze({
      count: partyCount,
      first: partyCount === 0 ? null : decodeGen3Pokemon(reader, addresses.playerParty),
    }),
    battle: Object.freeze({
      active: battleActive,
      typeFlags: readUnsigned(reader, "read32", addresses.battleTypeFlags, 0xffffffff),
      opponent: battleActive ? decodeGen3Pokemon(reader, addresses.enemyParty) : null,
    }),
    location: locationReadable
      ? Object.freeze({
          mapGroup: readUnsigned(reader, "read8", saveBlock1Address + saveBlock1.mapGroupOffset, 0xff),
          mapNumber: readUnsigned(reader, "read8", saveBlock1Address + saveBlock1.mapNumberOffset, 0xff),
          x: signed16(readUnsigned(reader, "read16", saveBlock1Address + saveBlock1.positionXOffset, 0xffff)),
          y: signed16(readUnsigned(reader, "read16", saveBlock1Address + saveBlock1.positionYOffset, 0xffff)),
        })
      : null,
  });
}
