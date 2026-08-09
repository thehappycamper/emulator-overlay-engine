import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyChange,
  decodeTypedValues,
  diffWatchSnapshots,
  formatWatchRow,
  toHexString,
  toSigned,
} from "../tools/emerald-memory-explorer-lib.mjs";

test("toHexString pads per width and uppercases", () => {
  assert.equal(toHexString(1, 1), "0x01");
  assert.equal(toHexString(255, 1), "0xFF");
  assert.equal(toHexString(0x1234, 2), "0x1234");
  assert.equal(toHexString(0x2000000, 4), "0x02000000");
  assert.throws(() => toHexString(-1, 1), TypeError);
  assert.throws(() => toHexString(1.5, 1), TypeError);
});

test("toSigned performs correct two's-complement conversion per width", () => {
  assert.equal(toSigned(0, 1), 0);
  assert.equal(toSigned(127, 1), 127);
  assert.equal(toSigned(128, 1), -128);
  assert.equal(toSigned(255, 1), -1);
  assert.equal(toSigned(0x7fff, 2), 32767);
  assert.equal(toSigned(0x8000, 2), -32768);
  assert.equal(toSigned(0xffff, 2), -1);
  assert.equal(toSigned(0x7fffffff, 4), 2147483647);
  assert.equal(toSigned(0x80000000, 4), -2147483648);
  assert.equal(toSigned(0xffffffff, 4), -1);
});

test("decodeTypedValues only includes widths that were actually read", () => {
  assert.deepEqual(decodeTypedValues({ u8: 1, u16: 258, u32: undefined }), {
    u8: 1,
    s8: 1,
    u16: 258,
    s16: 258,
  });
  assert.deepEqual(decodeTypedValues({}), {});
});

test("classifyChange distinguishes new/unchanged/increased/decreased", () => {
  assert.equal(classifyChange(undefined, 5), "new");
  assert.equal(classifyChange(null, 5), "new");
  assert.equal(classifyChange(5, 5), "unchanged");
  assert.equal(classifyChange(5, 8), "increased");
  assert.equal(classifyChange(8, 5), "decreased");
});

test("diffWatchSnapshots matches watches by label and classifies each width independently", () => {
  const previous = [{ label: "hp", u8: 10, u16: 10, u32: 10 }];
  const current = [{ label: "hp", u8: 10, u16: 5, u32: 20 }, { label: "level", u8: 5, u16: 5, u32: 5 }];

  const result = diffWatchSnapshots(previous, current);
  assert.equal(result[0].changes.u8, "unchanged");
  assert.equal(result[0].changes.u16, "decreased");
  assert.equal(result[0].changes.u32, "increased");
  assert.equal(result[1].changes.u8, "new");
});

test("diffWatchSnapshots handles an empty/missing previous snapshot without throwing", () => {
  const current = [{ label: "hp", u8: 10 }];
  assert.deepEqual(diffWatchSnapshots(null, current)[0].changes, { u8: "new", u16: "new", u32: "new" });
  assert.deepEqual(diffWatchSnapshots(undefined, undefined), []);
});

test("formatWatchRow renders hex/typed columns only for widths present on the watch", () => {
  const row = formatWatchRow({ label: "playerPartyCount", address: 0x020244e9, u8: 1 });
  assert.equal(row.label, "playerPartyCount");
  assert.equal(row.address, "0x020244E9");
  assert.equal(row.u8, 1);
  assert.equal(row.hex8, "0x01");
  assert.equal("u16" in row, false);
  assert.equal("u32" in row, false);
});
