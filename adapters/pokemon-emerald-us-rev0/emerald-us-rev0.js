import {
  calculateCatchChance,
  calculateMaxPp,
  decodeGen3Text,
  decodeStatusCondition,
  deriveGender,
  expProgress,
  lookupBallInfo,
  lookupEncounters,
  lookupItem,
  lookupLocation,
  lookupMove,
  lookupSpecies,
  resolveBallMultiplier,
} from "./reference-data.js";

// BATTLE_TYPE_TRAINER (include/constants/battle.h: `#define
// BATTLE_TYPE_TRAINER (1 << 3)`) - the single bit within `typeFlags` that
// distinguishes a trainer battle from a wild encounter. Ball-throwing/catch
// odds are only meaningful for wild encounters.
const BATTLE_TYPE_TRAINER = 1 << 3;

// Substructure order tables for personality % 24 (all four types).
// GROWTH_SUBSTRUCT_INDEX was already reviewed/proven correct in P05-T004.
// ATTACKS/EVS_CONDITION/MISC_SUBSTRUCT_INDEX were newly derived for
// P05-T009 by transcribing every column of pokeemerald's own
// GetSubstruct()/SUBSTRUCT_CASE table (src/pokemon.c), not re-derived from
// a partial memory of the pattern - see docs/tasks/P05/P05-T009.md's
// Implementation Notes for the full 24-row cross-check against that
// source, including independent verification that this file's existing
// GROWTH_SUBSTRUCT_INDEX matches that same table's first column exactly.
const GROWTH_SUBSTRUCT_INDEX = Object.freeze([
  0, 0, 0, 0, 0, 0,
  1, 1, 2, 3, 2, 3,
  1, 1, 2, 3, 2, 3,
  1, 1, 2, 3, 2, 3,
]);
const ATTACKS_SUBSTRUCT_INDEX = Object.freeze([
  1, 1, 2, 3, 2, 3,
  0, 0, 0, 0, 0, 0,
  2, 3, 1, 1, 3, 2,
  2, 3, 1, 1, 3, 2,
]);
const EVS_CONDITION_SUBSTRUCT_INDEX = Object.freeze([
  2, 3, 1, 1, 3, 2,
  2, 3, 1, 1, 3, 2,
  0, 0, 0, 0, 0, 0,
  3, 2, 3, 2, 1, 1,
]);
const MISC_SUBSTRUCT_INDEX = Object.freeze([
  3, 2, 3, 2, 1, 1,
  3, 2, 3, 2, 1, 1,
  3, 2, 3, 2, 1, 1,
  0, 0, 0, 0, 0, 0,
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
    nicknameOffset: 8,
    nicknameLength: 10,
    secureDataOffset: 32,
    substructSize: 12,
    statusOffset: 80,
    levelOffset: 84,
    currentHpOffset: 86,
    maxHpOffset: 88,
    attackOffset: 90,
    defenseOffset: 92,
    speedOffset: 94,
    spAttackOffset: 96,
    spDefenseOffset: 98,
  }),
  // Growth substruct field offsets (relative to that substruct's own start,
  // confirmed against include/pokemon.h's struct PokemonSubstruct0).
  growthSubstruct: Object.freeze({
    speciesOffset: 0,
    heldItemOffset: 2,
    experienceOffset: 4,
    ppBonusesOffset: 8,
  }),
  // Attacks substruct field offsets (struct PokemonSubstruct1).
  attacksSubstruct: Object.freeze({
    movesOffset: 0,
    ppOffset: 8,
  }),
  // Misc substruct field offsets (struct PokemonSubstruct3); only the IV
  // bitfield word is decoded here (bits 0-4 HP, 5-9 Atk, 10-14 Def, 15-19
  // Speed, 20-24 SpAtk, 25-29 SpDef - confirmed against that struct's field
  // order in include/pokemon.h).
  miscSubstruct: Object.freeze({
    ivWordOffset: 4,
  }),
  saveBlock1: Object.freeze({
    ewramStart: 0x02000000,
    ewramEnd: 0x02040000,
    positionXOffset: 0,
    positionYOffset: 2,
    mapGroupOffset: 4,
    mapNumberOffset: 5,
    // struct SaveBlock1's `flags` array starts at byte offset 0x1270
    // (confirmed directly from pret/pokeemerald's include/global.h, which
    // annotates every field with its exact byte offset). Badge flags
    // FLAG_BADGE01_GET..FLAG_BADGE08_GET are flag IDs 0x867-0x86E
    // (SYSTEM_FLAGS=0x860 + 0x7..0xE, confirmed against
    // include/constants/flags.h); as bit positions within the flags
    // bitfield that is bit 2151 (badge 1, byte 268 bit 7) through bit 2158
    // (badge 8, byte 269 bit 6).
    flagsOffset: 0x1270,
    badge1ByteOffset: 268,
    badge1Bit: 7,
    badges2Through8ByteOffset: 269,
    // struct SaveBlock1's `bagPocket_PokeBalls` field starts at byte offset
    // 0x650 (confirmed directly from pret/pokeemerald's include/global.h,
    // which annotates this field's exact byte offset the same way it does
    // `flags`); the next field, `bagPocket_TMHM`, starts at 0x690, so the
    // Poke Ball pocket holds (0x690-0x650)/4 = 16 four-byte ItemSlot
    // entries (struct ItemSlot { u16 itemId; u16 quantity; }; confirmed in
    // the same header).
    pokeBallsOffset: 0x650,
    pokeBallsSlotCount: 16,
    pokeBallsSlotSize: 4,
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

function substructAddress(baseAddress, personality, indexTable) {
  const layout = EMERALD_US_REV0.pokemon;
  return baseAddress + layout.secureDataOffset + indexTable[personality % 24] * layout.substructSize;
}

function decodeIvWord(ivWord) {
  return Object.freeze({
    hp: ivWord & 0x1f,
    atk: (ivWord >>> 5) & 0x1f,
    def: (ivWord >>> 10) & 0x1f,
    spe: (ivWord >>> 15) & 0x1f,
    spa: (ivWord >>> 20) & 0x1f,
    spd: (ivWord >>> 25) & 0x1f,
  });
}

// Decodes one 100-byte Gen III Pokemon struct at `address` into a rich,
// already-enriched (species/move/item names resolved) descriptor. Every
// numeric raw field this depends on is read fresh from `reader`; nothing
// here duplicates emulator-specific memory access - `reader` is the only
// emulator-facing dependency, matching the existing architecture boundary.
export function decodeGen3Pokemon(reader, address) {
  requireReader(reader);
  if (!Number.isInteger(address) || address < 0 || address > 0xffffffff) {
    throw new RangeError("Pokemon address must be an unsigned 32-bit integer");
  }

  const layout = EMERALD_US_REV0.pokemon;
  const growth = EMERALD_US_REV0.growthSubstruct;
  const attacks = EMERALD_US_REV0.attacksSubstruct;
  const misc = EMERALD_US_REV0.miscSubstruct;

  const personality = readUnsigned(reader, "read32", address, 0xffffffff);
  const otId = readUnsigned(reader, "read32", address + 4, 0xffffffff);

  const growthAddress = substructAddress(address, personality, GROWTH_SUBSTRUCT_INDEX);
  const attacksAddress = substructAddress(address, personality, ATTACKS_SUBSTRUCT_INDEX);
  const miscAddress = substructAddress(address, personality, MISC_SUBSTRUCT_INDEX);

  function decryptWord(substructAddr, offset) {
    const encrypted = readUnsigned(reader, "read32", substructAddr + offset, 0xffffffff);
    return (encrypted ^ personality ^ otId) >>> 0;
  }
  function decryptHalf(substructAddr, offset) {
    // Growth/Attacks 16-bit fields live inside a 32-bit-encrypted word; the
    // whole 4-byte span containing that field must be decrypted first, then
    // the relevant half extracted. Fields are 2-byte aligned within each
    // substruct, so decrypting the containing word at a 4-byte-aligned
    // offset and shifting is sufficient.
    const wordOffset = offset - (offset % 4);
    const word = decryptWord(substructAddr, wordOffset);
    return offset % 4 === 0 ? word & 0xffff : (word >>> 16) & 0xffff;
  }
  function decryptByte(substructAddr, offset) {
    const wordOffset = offset - (offset % 4);
    const word = decryptWord(substructAddr, wordOffset);
    const shift = (offset % 4) * 8;
    return (word >>> shift) & 0xff;
  }

  const speciesId = decryptHalf(growthAddress, growth.speciesOffset);
  const heldItemId = decryptHalf(growthAddress, growth.heldItemOffset);
  const experience = decryptWord(growthAddress, growth.experienceOffset);
  const ppBonuses = decryptByte(growthAddress, growth.ppBonusesOffset);

  const moves = [];
  for (let moveIndex = 0; moveIndex < 4; moveIndex += 1) {
    const moveId = decryptHalf(attacksAddress, attacks.movesOffset + moveIndex * 2);
    const currentPp = decryptByte(attacksAddress, attacks.ppOffset + moveIndex);
    if (moveId === 0) continue;
    const moveInfo = lookupMove(moveId);
    moves.push(
      Object.freeze({
        id: moveId,
        name: moveInfo?.name ?? null,
        type: moveInfo?.type ?? null,
        category: moveInfo?.category ?? null,
        power: moveInfo?.power ?? null,
        accuracy: moveInfo?.accuracy ?? null,
        currentPp,
        maxPp: moveInfo ? calculateMaxPp(moveInfo.pp, ppBonuses, moveIndex) : null,
      }),
    );
  }

  const ivWord = decryptWord(miscAddress, misc.ivWordOffset);
  const ivs = decodeIvWord(ivWord);

  const nicknameBytes = [];
  for (let i = 0; i < layout.nicknameLength; i += 1) {
    nicknameBytes.push(readUnsigned(reader, "read8", address + layout.nicknameOffset + i, 0xff));
  }

  const speciesInfo = lookupSpecies(speciesId);
  const status1 = readUnsigned(reader, "read32", address + layout.statusOffset, 0xffffffff);
  const level = readUnsigned(reader, "read8", address + layout.levelOffset, 0xff);

  return Object.freeze({
    speciesId,
    name: speciesInfo?.name ?? null,
    nickname: decodeGen3Text(nicknameBytes),
    types: speciesInfo?.types ?? null,
    gender: deriveGender(speciesInfo?.genderRatio, personality),
    level,
    currentHp: readUnsigned(reader, "read16", address + layout.currentHpOffset, 0xffff),
    maxHp: readUnsigned(reader, "read16", address + layout.maxHpOffset, 0xffff),
    status: decodeStatusCondition(status1),
    item: heldItemId ? lookupItem(heldItemId) : null,
    itemId: heldItemId || null,
    exp: experience,
    expProgress: speciesInfo?.growthRate ? expProgress(speciesInfo.growthRate, level, experience) : null,
    catchRate: speciesInfo?.catchRate ?? null,
    stats: Object.freeze({
      atk: readUnsigned(reader, "read16", address + layout.attackOffset, 0xffff),
      def: readUnsigned(reader, "read16", address + layout.defenseOffset, 0xffff),
      spe: readUnsigned(reader, "read16", address + layout.speedOffset, 0xffff),
      spa: readUnsigned(reader, "read16", address + layout.spAttackOffset, 0xffff),
      spd: readUnsigned(reader, "read16", address + layout.spDefenseOffset, 0xffff),
    }),
    ivs,
    moves: Object.freeze(moves),
  });
}

function readBadges(reader, saveBlock1Address) {
  const layout = EMERALD_US_REV0.saveBlock1;
  const badge1Byte = readUnsigned(reader, "read8", saveBlock1Address + layout.flagsOffset + layout.badge1ByteOffset, 0xff);
  const badges2Through8Byte = readUnsigned(
    reader,
    "read8",
    saveBlock1Address + layout.flagsOffset + layout.badges2Through8ByteOffset,
    0xff,
  );
  const badges = [(badge1Byte >>> layout.badge1Bit) & 1];
  for (let bit = 0; bit < 7; bit += 1) {
    badges.push((badges2Through8Byte >>> bit) & 1);
  }
  return Object.freeze(badges.map(Boolean));
}

// `wildOpponent` is only passed for an active, non-trainer battle - catch
// odds are only meaningful (and only computed) against a wild Pokemon.
// `catchChance` is a pure computation from already-decoded values (the same
// kind of derived field as `expProgress`/`status`), so it belongs here in
// the game-owned acquisition layer, not in presentation - see
// docs/tasks/P05/P05-T011.md's architecture notes.
function readBag(reader, saveBlock1Address, wildOpponent) {
  const layout = EMERALD_US_REV0.saveBlock1;
  const balls = [];
  for (let slot = 0; slot < layout.pokeBallsSlotCount; slot += 1) {
    const slotAddress = saveBlock1Address + layout.pokeBallsOffset + slot * layout.pokeBallsSlotSize;
    const itemId = readUnsigned(reader, "read16", slotAddress, 0xffff);
    const quantity = readUnsigned(reader, "read16", slotAddress + 2, 0xffff);
    if (itemId === 0) continue; // empty slot
    const ballInfo = lookupBallInfo(itemId);
    let catchChance = null;
    if (wildOpponent && ballInfo) {
      const multiplier = resolveBallMultiplier(ballInfo, { opponentTypes: wildOpponent.types, opponentLevel: wildOpponent.level });
      catchChance = calculateCatchChance({
        catchRate: wildOpponent.catchRate,
        ballMultiplier: multiplier,
        maxHp: wildOpponent.maxHp,
        currentHp: wildOpponent.currentHp,
        status: wildOpponent.status,
      });
    }
    balls.push(Object.freeze({ id: itemId, name: ballInfo?.name ?? lookupItem(itemId), quantity, catchChance }));
  }
  return Object.freeze({ balls: Object.freeze(balls) });
}

export function readEmeraldAcquisition(reader) {
  requireReader(reader);
  const { addresses, saveBlock1, pokemon } = EMERALD_US_REV0;
  const partyCount = readUnsigned(reader, "read8", addresses.playerPartyCount, 0xff);
  if (partyCount > 6) {
    throw new RangeError(`Invalid Emerald party count: ${partyCount}`);
  }

  const party = [];
  for (let slot = 0; slot < partyCount; slot += 1) {
    party.push(decodeGen3Pokemon(reader, addresses.playerParty + slot * pokemon.structSize));
  }

  const inBattleFlags = readUnsigned(reader, "read8", addresses.mainInBattleFlags, 0xff);
  const battleActive = (inBattleFlags & 0x02) !== 0;
  const saveBlock1Address = readUnsigned(reader, "read32", addresses.saveBlock1Pointer, 0xffffffff);
  const saveBlock1Readable =
    saveBlock1Address >= saveBlock1.ewramStart &&
    saveBlock1Address + saveBlock1.badges2Through8ByteOffset + saveBlock1.flagsOffset < saveBlock1.ewramEnd;
  const locationReadable =
    saveBlock1Address >= saveBlock1.ewramStart &&
    saveBlock1Address + saveBlock1.mapNumberOffset < saveBlock1.ewramEnd;

  const typeFlags = readUnsigned(reader, "read32", addresses.battleTypeFlags, 0xffffffff);
  const trainerBattle = (typeFlags & BATTLE_TYPE_TRAINER) !== 0;
  const opponent = battleActive ? decodeGen3Pokemon(reader, addresses.enemyParty) : null;
  const wildOpponent = battleActive && !trainerBattle ? opponent : null;

  return Object.freeze({
    party: Object.freeze({
      count: partyCount,
      slots: Object.freeze(party),
      // Preserved for compatibility with any existing single-slot
      // consumer; new consumers should use `slots`.
      first: party[0] ?? null,
    }),
    battle: Object.freeze({
      active: battleActive,
      typeFlags,
      trainerBattle,
      opponent,
    }),
    location: locationReadable
      ? (() => {
          const mapGroup = readUnsigned(reader, "read8", saveBlock1Address + saveBlock1.mapGroupOffset, 0xff);
          const mapNumber = readUnsigned(reader, "read8", saveBlock1Address + saveBlock1.mapNumberOffset, 0xff);
          return Object.freeze({
            mapGroup,
            mapNumber,
            name: lookupLocation(mapGroup, mapNumber),
            x: signed16(readUnsigned(reader, "read16", saveBlock1Address + saveBlock1.positionXOffset, 0xffff)),
            y: signed16(readUnsigned(reader, "read16", saveBlock1Address + saveBlock1.positionYOffset, 0xffff)),
            encounters: lookupEncounters(mapGroup, mapNumber),
          });
        })()
      : null,
    badges: saveBlock1Readable ? readBadges(reader, saveBlock1Address) : null,
    bag: saveBlock1Readable ? readBag(reader, saveBlock1Address, wildOpponent) : null,
  });
}
