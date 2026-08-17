import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EMERALD_US_REV0,
  assertSupportedEmeraldIdentity,
  decodeGen3Pokemon,
  growthSubstructIndex,
  readEmeraldAcquisition,
} from "../adapters/pokemon-emerald-us-rev0/emerald-us-rev0.js";

const fixtureUrl = new URL(
  "../adapters/pokemon-emerald-us-rev0/fixtures/emerald-us-rev0-derived.json",
  import.meta.url,
);

function createReader(memory) {
  const read = (width, address) => {
    const key = `0x${address.toString(16).padStart(8, "0")}`;
    const value = memory[width][key];
    if (value === undefined) {
      throw new RangeError(`Fixture has no ${width} value at ${key}`);
    }
    return value;
  };

  return {
    read8: (address) => read("read8", address),
    read16: (address) => read("read16", address),
    read32: (address) => read("read32", address),
  };
}

test("Emerald identity accepts only the supported retail revision fingerprint", () => {
  assert.equal(assertSupportedEmeraldIdentity(EMERALD_US_REV0.identity), true);
  assert.throws(
    () => assertSupportedEmeraldIdentity({ ...EMERALD_US_REV0.identity, revision: 1 }),
    /Unsupported Emerald ROM/,
  );
  assert.throws(
    () => assertSupportedEmeraldIdentity({ ...EMERALD_US_REV0.identity, crc32: "00000000" }),
    /Unsupported Emerald ROM/,
  );
});

test("growth substruct selection covers all 24 Gen III permutations", () => {
  const expected = [
    0, 0, 0, 0, 0, 0,
    1, 1, 2, 3, 2, 3,
    1, 1, 2, 3, 2, 3,
    1, 1, 2, 3, 2, 3,
  ];
  assert.deepEqual(expected.map((_, personality) => growthSubstructIndex(personality)), expected);
});

test("Gen III Pokemon decoding reads nickname, species/type/gender lookups, status, held item, EXP progress, stats, IVs, and moves-with-PP", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const reader = createReader(fixture.memory);

  const partySlot0 = decodeGen3Pokemon(reader, EMERALD_US_REV0.addresses.playerParty);
  assert.deepEqual(partySlot0, fixture.expected.party.first);
  assert.equal(partySlot0.nickname, "SPROUT");
  assert.equal(partySlot0.name, "TORCHIC");
  assert.deepEqual(partySlot0.types, ["Fire"]);
  assert.equal(partySlot0.gender, "male");
  assert.equal(partySlot0.status, "none");
  assert.equal(partySlot0.item, "POTION");
  assert.equal(partySlot0.moves.length, 2);
  assert.equal(partySlot0.moves[0].name, "TACKLE");
  assert.equal(partySlot0.moves[0].maxPp, 42); // base 35 + 1 PP Up (20%)
  assert.ok(partySlot0.expProgress.percent > 0 && partySlot0.expProgress.percent < 100);

  const opponent = decodeGen3Pokemon(reader, EMERALD_US_REV0.addresses.enemyParty);
  assert.deepEqual(opponent, fixture.expected.battle.opponent);
  assert.equal(opponent.name, "CHARIZARD");
  assert.deepEqual(opponent.types, ["Fire", "Flying"]);
});

test("a fainted, asleep second party slot decodes safely at its own address (100 bytes past slot 0)", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const reader = createReader(fixture.memory);
  const slot1Address = EMERALD_US_REV0.addresses.playerParty + EMERALD_US_REV0.pokemon.structSize;
  const slot1 = decodeGen3Pokemon(reader, slot1Address);

  assert.equal(slot1.name, "BULBASAUR");
  assert.equal(slot1.nickname, "SLEEPY");
  assert.equal(slot1.currentHp, 0); // fainted
  assert.equal(slot1.status, "asleep");
  assert.deepEqual(slot1, fixture.expected.party.slots[1]);
});

test("acquisition decoding returns all party slots (not just the first), battle, badges, and map diagnostics", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  assert.equal(assertSupportedEmeraldIdentity(fixture.identity), true);
  const acquisition = readEmeraldAcquisition(createReader(fixture.memory));
  assert.deepEqual(acquisition, fixture.expected);
  assert.equal(acquisition.party.slots.length, 2);
  assert.equal(acquisition.party.count, 2);
  // `first` remains a compatibility duplicate of slots[0], not a separate read.
  assert.deepEqual(acquisition.party.first, acquisition.party.slots[0]);
  assert.deepEqual(acquisition.badges, [true, true, false, true, false, false, false, false]);
});

test("acquisition decoding reads exactly `count` slots at 100-byte-stride addresses, up to all six", () => {
  // A minimal stub reader proving the N-slot iteration and addressing
  // pattern generalizes to a full 6-member party, without needing six
  // fully hand-encrypted Pokemon structs: every address this stub doesn't
  // explicitly recognize decodes to a harmless "empty" Pokemon (personality
  // 0, otId 0, species 0 after decrypt, all-zero stats), which is enough to
  // prove which addresses were actually touched.
  const touchedAddresses = new Set();
  const reader = {
    read8: (address) => {
      touchedAddresses.add(address);
      if (address === EMERALD_US_REV0.addresses.playerPartyCount) return 6;
      if (address === EMERALD_US_REV0.addresses.mainInBattleFlags) return 0;
      return 0;
    },
    read16: (address) => {
      touchedAddresses.add(address);
      return 0;
    },
    read32: (address) => {
      touchedAddresses.add(address);
      if (address === EMERALD_US_REV0.addresses.saveBlock1Pointer) return 0; // unreadable location on purpose
      return 0;
    },
  };

  const acquisition = readEmeraldAcquisition(reader);
  assert.equal(acquisition.party.count, 6);
  assert.equal(acquisition.party.slots.length, 6);

  for (let slot = 0; slot < 6; slot += 1) {
    const slotBase = EMERALD_US_REV0.addresses.playerParty + slot * EMERALD_US_REV0.pokemon.structSize;
    assert.ok(touchedAddresses.has(slotBase), `expected slot ${slot}'s personality address to be read`);
    assert.ok(touchedAddresses.has(slotBase + 4), `expected slot ${slot}'s otId address to be read`);
  }
});

test("acquisition decoding returns an empty slots array (not an error) for an empty party", () => {
  const reader = {
    read8: (address) => (address === EMERALD_US_REV0.addresses.playerPartyCount ? 0 : 0),
    read16: () => 0,
    read32: (address) => (address === EMERALD_US_REV0.addresses.saveBlock1Pointer ? 0 : 0),
  };
  const acquisition = readEmeraldAcquisition(reader);
  assert.equal(acquisition.party.count, 0);
  assert.deepEqual(acquisition.party.slots, []);
  assert.equal(acquisition.party.first, null);
});

test("acquisition decoding rejects impossible party counts before reading a Pokemon", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  fixture.memory.read8["0x020244e9"] = 255;
  assert.throws(
    () => readEmeraldAcquisition(createReader(fixture.memory)),
    /Invalid Emerald party count/,
  );
});

test("invalid save pointers produce a null location and null badges instead of arbitrary memory reads", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  fixture.memory.read32["0x03005d8c"] = 0;
  const acquisition = readEmeraldAcquisition(createReader(fixture.memory));
  assert.equal(acquisition.location, null);
  assert.equal(acquisition.badges, null);
});

// Regression coverage for the real-BizHawk acquisition failure: bag pocket
// quantities are stored in EWRAM XORed against SaveBlock2's own
// encryptionKey (pret/pokeemerald src/item.c's GetBagItemQuantity/
// SetBagItemQuantity; see emerald-us-rev0.js's readBag for the full
// authoritative-source citation). The fixture's raw memory now encodes
// this exactly as a real save would: the stored quantities are the
// encrypted (XORed) values, not the plaintext ball counts.
test("bag Poke Ball quantities are decrypted against SaveBlock2's encryptionKey, and item ids remain plaintext", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const acquisition = readEmeraldAcquisition(createReader(fixture.memory));
  assert.ok(acquisition.bag, "bag must be readable when both SaveBlock1 and SaveBlock2 resolve to valid EWRAM addresses");
  assert.deepEqual(
    acquisition.bag.balls.map((ball) => ({ id: ball.id, name: ball.name, quantity: ball.quantity })),
    [
      { id: 4, name: "Poke Ball", quantity: 8 },
      { id: 3, name: "Great Ball", quantity: 3 },
      { id: 2, name: "Ultra Ball", quantity: 1 },
    ],
  );
});

test("an unreadable SaveBlock2 pointer fails bag acquisition closed (bag: null) - never a zero-key fallback, never clamped/partial data", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  // gSaveBlock2Ptr itself resolves to 0 - the same degenerate-pointer case
  // already exercised for gSaveBlock1Ptr above. SaveBlock1 remains fully
  // readable, so location/badges are unaffected - only bag depends on
  // SaveBlock2's own encryption key.
  fixture.memory.read32["0x03005d90"] = 0;
  const acquisition = readEmeraldAcquisition(createReader(fixture.memory));
  assert.equal(acquisition.bag, null);
  assert.notEqual(acquisition.location, null);
  assert.notEqual(acquisition.badges, null);
});

test("an unreadable SaveBlock2 encryption key fails bag acquisition closed without aborting other state", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const reader = createReader(fixture.memory);
  const originalRead32 = reader.read32;
  reader.read32 = (address) => {
    if (address === 0x020310ac) throw new RangeError("SaveBlock2 encryption key is unreadable");
    return originalRead32(address);
  };

  const acquisition = readEmeraldAcquisition(reader);
  assert.equal(acquisition.bag, null);
  assert.notEqual(acquisition.location, null);
  assert.notEqual(acquisition.badges, null);
});

test("characterizes the original defect: the raw encrypted quantity exceeds the real 999-per-slot cap if read without decryption, exactly reproducing the real-BizHawk schema failure", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  // The Poke Ball slot's raw, still-encrypted quantity word in EWRAM - what
  // the pre-fix decoder returned verbatim as "quantity".
  const rawQuantity = fixture.memory.read16["0x0203065a"];
  assert.equal(rawQuantity, 15429);
  assert.ok(
    rawQuantity > 999,
    "the raw encrypted value must exceed the schema's real 999-per-slot cap - this is exactly the " +
      "'data/bag/balls/0/quantity must be <= 999' failure observed against a real BizHawk session",
  );

  const acquisition = readEmeraldAcquisition(createReader(fixture.memory));
  const decoded = acquisition.bag.balls.find((ball) => ball.id === 4).quantity;
  assert.equal(decoded, 8);
  assert.ok(decoded <= 999, "the corrected decode must always fall within the real per-slot cap");
});

test("shared Lua acquisition constants stay synchronized with the tested layout", async () => {
  const lua = await readFile(
    new URL(
      "../adapters/pokemon-emerald-us-rev0/emerald-acquisition.lua",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(lua, new RegExp(EMERALD_US_REV0.identity.crc32));
  const expectedAddresses = Object.values(EMERALD_US_REV0.addresses).map((value) =>
    value.toString(16).toUpperCase().padStart(8, "0"),
  );
  for (const value of expectedAddresses) {
    assert.match(lua, new RegExp(`0x${value}`));
  }
});
