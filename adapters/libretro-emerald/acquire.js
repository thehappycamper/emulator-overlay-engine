// The thin Libretro -> Emerald adapter's orchestration entry point. This
// is the only file in this package that ties the generic Libretro
// provider client to the existing, game-owned Emerald acquisition logic -
// everything it calls is either already-reviewed shared code
// (readValidatedEmeraldSourceSnapshot, assertSupportedEmeraldIdentity) or
// the small translation helpers in reader.js/identity.js. No Gen III
// struct decoding, species/move/item/location lookup, or Emerald memory
// address lives here.
import { LIBRETRO_SOURCE } from "../pokemon-emerald-us-rev0/emerald-source-contract.js";
import { readValidatedEmeraldSourceSnapshot } from "../pokemon-emerald-us-rev0/validate-source-snapshot.js";
import { assertSupportedEmeraldIdentity, readEmeraldRomIdentity } from "./identity.js";
import { createSnapshotReader, fetchEmeraldMemorySnapshot, resolveVerifiedRegions } from "./reader.js";

export class UnsupportedLibretroCoreError extends RangeError {
  constructor(message) {
    super(message);
    this.name = "UnsupportedLibretroCoreError";
  }
}

// The isolated provider can host any Libretro core - this adapter only
// ever trusts the official mGBA core, and fails closed rather than
// attempting to acquire Emerald state from an arbitrary/unexpected one.
// Version pinning is deliberately loose (name + GBA content support only)
// since the provider's own initialize() already enforces the Libretro ABI
// version match; this is a game/system-capability check, not an ABI check.
export function assertSupportedLibretroCore(core) {
  const name = String(core?.name ?? "");
  const validExtensions = String(core?.validExtensions ?? "");
  if (!/mgba/iu.test(name)) {
    throw new UnsupportedLibretroCoreError(`Unsupported Libretro core "${core?.name ?? "unknown"}": expected the official mGBA core`);
  }
  if (!validExtensions.split("|").map((ext) => ext.trim().toLowerCase()).includes("gba")) {
    throw new UnsupportedLibretroCoreError(`Libretro core "${name}" does not declare GBA content support (validExtensions: "${validExtensions}")`);
  }
  return true;
}

function readRangeOverClient(client) {
  return async (regionId, offset, length) => {
    const { bytes } = await client.request("readRange", { regionId, offset, length });
    return Buffer.from(bytes, "base64");
  };
}

// Runs the full initialize -> verify -> acquire sequence against an
// already-constructed (but not yet started) provider `client` - anything
// exposing an async `request(op, params)` matching LibretroProviderClient's
// own shape. Does not call `client.shutdown()`; see
// `runOnceEmeraldLibretroAcquisition` below for the try/finally-wrapped
// convenience entry point most callers want. Kept separate so a caller
// managing a longer-lived provider session (future polling loop) can
// acquire repeatedly without restarting the provider each time.
export async function acquireEmeraldSourceSnapshot({
  client,
  corePath,
  contentPath,
  bootstrapFrames = 0,
  fileSystem,
  // Injectable so tests can supply a known-good identity without needing
  // the real (uncommitted) Emerald ROM file - defaults to the real
  // file-hash-based check every real caller gets. Whatever it returns
  // still passes through the unmodified `assertSupportedEmeraldIdentity`
  // below, so the accept/reject decision is never bypassed by injection,
  // only the *source* of the identity claim is.
  identityFn = (path) => readEmeraldRomIdentity(path, fileSystem ? { fileSystem } : undefined),
}) {
  if (!client || typeof client.request !== "function") {
    throw new TypeError("client must provide an async request(op, params) method");
  }
  if (typeof corePath !== "string" || !corePath) throw new TypeError("corePath must be a non-empty string");
  if (typeof contentPath !== "string" || !contentPath) throw new TypeError("contentPath must be a non-empty string");

  // Verify the configured ROM's identity before ever asking the provider
  // to load it - a wrong ROM fails closed immediately, without spending a
  // real core-load round trip on content this adapter would reject anyway.
  const identity = await identityFn(contentPath);
  assertSupportedEmeraldIdentity(identity);

  const initResult = await client.request("initialize", { corePath, contentPath });
  assertSupportedLibretroCore(initResult.core);

  if (bootstrapFrames > 0) {
    await client.request("run", { frames: bootstrapFrames });
  }

  const verifiedRegions = resolveVerifiedRegions(initResult.memoryRegions);
  const snapshot = await fetchEmeraldMemorySnapshot(readRangeOverClient(client), verifiedRegions);
  const reader = createSnapshotReader(snapshot);

  return readValidatedEmeraldSourceSnapshot(LIBRETRO_SOURCE, identity, reader);
}

// The bounded, one-shot entry point: starts the provider, acquires exactly
// one validated Emerald source snapshot, and always shuts the provider
// down afterward - on success, on a fail-closed rejection from any of the
// checks above, or on an unexpected provider error alike. This is what a
// `--once`/smoke CLI (and, later, a real polling session) should call.
export async function runOnceEmeraldLibretroAcquisition(options) {
  const { client } = options;
  try {
    return await acquireEmeraldSourceSnapshot(options);
  } finally {
    if (typeof client.shutdown === "function") {
      await client.shutdown();
    }
  }
}
