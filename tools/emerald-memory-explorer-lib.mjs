// Pure, dependency-free helpers for the developer-only Emerald memory
// explorer. Used by both the browser UI (imported directly as an ES
// module, no bundler) and the Node test suite. Contains no emulator API
// calls, no file I/O, and no game-semantic decoding - only generic
// hex/typed-interpretation/diff logic over already-read raw values.

export function toHexString(value, width) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError("toHexString requires a non-negative integer value");
  }
  const digits = width === 1 ? 2 : width === 2 ? 4 : 8;
  return "0x" + value.toString(16).toUpperCase().padStart(digits, "0");
}

export function toSigned(value, width) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError("toSigned requires a non-negative integer value");
  }
  const bits = width * 8;
  const signBit = 1 << (bits - 1);
  if (width === 4) {
    // 32-bit signed conversion via >>> 0 / | 0 to avoid the 1<<31 overflow
    // that plain bitwise ops on a 32-bit-width literal would hit.
    return value | 0;
  }
  return (value & signBit) !== 0 ? value - (1 << bits) : value;
}

export function decodeTypedValues(rawByWidth) {
  const { u8, u16, u32 } = rawByWidth;
  const result = {};
  if (typeof u8 === "number") {
    result.u8 = u8;
    result.s8 = toSigned(u8, 1);
  }
  if (typeof u16 === "number") {
    result.u16 = u16;
    result.s16 = toSigned(u16, 2);
  }
  if (typeof u32 === "number") {
    result.u32 = u32;
    result.s32 = toSigned(u32, 4);
  }
  return result;
}

export function classifyChange(previous, current) {
  if (previous === undefined || previous === null) {
    return "new";
  }
  if (current === previous) {
    return "unchanged";
  }
  return current > previous ? "increased" : "decreased";
}

// Compares a previous and current watch-value snapshot (keyed by watch
// label) and returns, per watch, per numeric width, a change classification
// against the prior poll. Used by the UI to highlight rows without
// requiring the emulator connector itself to track history.
export function diffWatchSnapshots(previousWatches, currentWatches) {
  const previousByLabel = new Map((previousWatches ?? []).map((watch) => [watch.label, watch]));
  return (currentWatches ?? []).map((watch) => {
    const previous = previousByLabel.get(watch.label);
    return {
      ...watch,
      changes: {
        u8: classifyChange(previous?.u8, watch.u8),
        u16: classifyChange(previous?.u16, watch.u16),
        u32: classifyChange(previous?.u32, watch.u32),
      },
    };
  });
}

export function formatWatchRow(watch) {
  const typed = decodeTypedValues(watch);
  return {
    label: watch.label,
    address: toHexString(watch.address, 4),
    ...(typed.u8 !== undefined ? { u8: typed.u8, s8: typed.s8, hex8: toHexString(typed.u8, 1) } : {}),
    ...(typed.u16 !== undefined ? { u16: typed.u16, s16: typed.s16, hex16: toHexString(typed.u16, 2) } : {}),
    ...(typed.u32 !== undefined ? { u32: typed.u32, s32: typed.s32, hex32: toHexString(typed.u32, 4) } : {}),
  };
}
