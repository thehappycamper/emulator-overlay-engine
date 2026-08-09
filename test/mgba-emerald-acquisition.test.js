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

test("Gen III Pokemon decoding reads encrypted species and live stat fields", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const reader = createReader(fixture.memory);
  assert.deepEqual(
    decodeGen3Pokemon(reader, EMERALD_US_REV0.addresses.playerParty),
    fixture.expected.party.first,
  );
  assert.deepEqual(
    decodeGen3Pokemon(reader, EMERALD_US_REV0.addresses.enemyParty),
    fixture.expected.battle.opponent,
  );
});

test("acquisition decoding returns party, battle, opponent, and map diagnostics", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  assert.equal(assertSupportedEmeraldIdentity(fixture.identity), true);
  assert.deepEqual(readEmeraldAcquisition(createReader(fixture.memory)), fixture.expected);
});

test("acquisition decoding rejects impossible party counts before reading a Pokemon", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  fixture.memory.read8["0x020244e9"] = 255;
  assert.throws(
    () => readEmeraldAcquisition(createReader(fixture.memory)),
    /Invalid Emerald party count/,
  );
});

test("invalid save pointers produce a null location instead of arbitrary memory reads", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  fixture.memory.read32["0x03005d8c"] = 0;
  assert.equal(readEmeraldAcquisition(createReader(fixture.memory)).location, null);
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
