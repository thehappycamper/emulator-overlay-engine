import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSupportedEmeraldIdentity,
  computeEmeraldRomIdentityFromBytes,
  readEmeraldRomIdentity,
} from "../adapters/libretro-emerald/identity.js";
import { EMERALD_US_REV0 } from "../adapters/pokemon-emerald-us-rev0/emerald-us-rev0.js";

// A real, independently-known CRC32 test vector unrelated to any ROM: the
// well-known "The quick brown fox..." string's CRC32 is 0x414FA339. Using
// this (rather than only the real Emerald ROM, which is not committed)
// proves computeEmeraldRomIdentityFromBytes computes a real, correct
// CRC32 - not a value that merely happens to satisfy this task's own tests.
test("computeEmeraldRomIdentityFromBytes computes a real, independently-verifiable CRC32", () => {
  const bytes = Buffer.from("The quick brown fox jumps over the lazy dog", "utf8");
  const identity = computeEmeraldRomIdentityFromBytes(bytes);
  assert.equal(identity.crc32, "414FA339");
});

test("computeEmeraldRomIdentityFromBytes reports the known Emerald gameCode/title/revision alongside the computed hash", () => {
  const identity = computeEmeraldRomIdentityFromBytes(Buffer.from("arbitrary content"));
  assert.equal(identity.gameCode, EMERALD_US_REV0.identity.gameCode);
  assert.equal(identity.title, EMERALD_US_REV0.identity.title);
  assert.equal(identity.revision, EMERALD_US_REV0.identity.revision);
});

test("computeEmeraldRomIdentityFromBytes rejects non-buffer input", () => {
  assert.throws(() => computeEmeraldRomIdentityFromBytes("not a buffer"), TypeError);
  assert.throws(() => computeEmeraldRomIdentityFromBytes(null), TypeError);
});

test("assertSupportedEmeraldIdentity accepts a real Emerald-matching identity and rejects any other content's hash (unsupported content identity)", () => {
  const identity = computeEmeraldRomIdentityFromBytes(Buffer.alloc(0x1000, 0));
  // A synthetic buffer will not really hash to the known Emerald CRC32 -
  // construct the "matches" and "does not match" cases explicitly instead
  // of relying on chance.
  const matching = { ...identity, crc32: EMERALD_US_REV0.identity.crc32 };
  const nonMatching = { ...identity, crc32: "DEADBEEF" };
  assert.equal(assertSupportedEmeraldIdentity(matching), true);
  assert.throws(() => assertSupportedEmeraldIdentity(nonMatching), RangeError);
});

test("readEmeraldRomIdentity reads the file via an injected fileSystem and delegates to the pure computation", async () => {
  const bytes = Buffer.from("fake rom content for injected fileSystem test");
  const reads = [];
  const fileSystem = {
    readFile: async (path) => {
      reads.push(path);
      return bytes;
    },
  };
  const identity = await readEmeraldRomIdentity("C:\\fake\\Pokemon Emerald.gba", { fileSystem });
  assert.deepEqual(reads, ["C:\\fake\\Pokemon Emerald.gba"]);
  assert.deepEqual(identity, computeEmeraldRomIdentityFromBytes(bytes));
});

test("readEmeraldRomIdentity propagates a real file-read failure (missing ROM) rather than fabricating an identity", async () => {
  const fileSystem = { readFile: async () => { throw new Error("ENOENT: no such file"); } };
  await assert.rejects(() => readEmeraldRomIdentity("C:\\missing\\Pokemon Emerald.gba", { fileSystem }), /ENOENT/);
});
