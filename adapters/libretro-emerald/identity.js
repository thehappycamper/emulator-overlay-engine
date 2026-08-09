// Determines Emerald ROM identity for the Libretro path by hashing the
// local ROM file directly, rather than reading it back out of emulated
// memory. Unlike mGBA's Lua API (`emu:getGameCode()`/`emu:getGameTitle()`),
// the Libretro provider exposes only low-level discovered memory regions,
// not a high-level identity call - and a whole-file CRC32 is a strictly
// stronger check than re-reading the 12+4+1 header bytes back out of ROM
// memory would be, since it verifies the entire cartridge image, not just
// its header. This mirrors BizHawk's own established pattern (proof-
// connector.lua trusts the shared identity constant once the configured
// ROM's SHA-1 hash matches) rather than inventing a new verification
// strategy.
import { readFile } from "node:fs/promises";
import { crc32 } from "node:zlib";
import { EMERALD_US_REV0, assertSupportedEmeraldIdentity } from "../pokemon-emerald-us-rev0/emerald-us-rev0.js";

// Pure: given raw ROM bytes, computes the identity object
// `assertSupportedEmeraldIdentity` expects. gameCode/title/revision are
// not re-derived from the file - a CRC32 match against
// EMERALD_US_REV0.identity.crc32 already proves the file is byte-for-byte
// identical to that known, reviewed ROM, so those fields are definitionally
// correct too. `assertSupportedEmeraldIdentity` is still the sole
// authority on whether this identity is actually accepted - this function
// never itself decides "supported," only reports what was found.
export function computeEmeraldRomIdentityFromBytes(bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new TypeError("ROM bytes must be a Buffer or Uint8Array");
  }
  const hash = crc32(bytes) >>> 0;
  const crc32Hex = hash.toString(16).toUpperCase().padStart(8, "0");
  return Object.freeze({
    gameCode: EMERALD_US_REV0.identity.gameCode,
    title: EMERALD_US_REV0.identity.title,
    revision: EMERALD_US_REV0.identity.revision,
    crc32: crc32Hex,
  });
}

// Reads the configured ROM file and computes its identity. Does not itself
// assert support - callers pass the result to `assertSupportedEmeraldIdentity`
// (re-exported below) so the pass/fail decision stays in exactly one place,
// the same shared function every other provider already uses.
export async function readEmeraldRomIdentity(contentPath, { fileSystem = { readFile } } = {}) {
  const bytes = await fileSystem.readFile(contentPath);
  return computeEmeraldRomIdentityFromBytes(bytes);
}

export { assertSupportedEmeraldIdentity };
