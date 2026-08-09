import assert from "node:assert/strict";
import test from "node:test";

import { EMERALD_US_REV0 } from "../adapters/pokemon-emerald-us-rev0/emerald-us-rev0.js";
import {
  buildWatchList,
  readArguments,
  watchListToLua,
} from "../tools/launch-emerald-memory-explorer.mjs";

test("buildWatchList is derived from EMERALD_US_REV0.addresses, not a hand-duplicated list", () => {
  const watches = buildWatchList();
  const expectedEntries = Object.entries(EMERALD_US_REV0.addresses);
  assert.equal(watches.length, expectedEntries.length);
  for (const [label, address] of expectedEntries) {
    const watch = watches.find((entry) => entry.label === label);
    assert.ok(watch, `expected a watch for ${label}`);
    assert.equal(watch.address, address);
  }
});

test("watchListToLua produces a loadable Lua table literal with every watch present", () => {
  const lua = watchListToLua([
    { label: "playerPartyCount", address: 0x020244e9 },
    { label: "battleTypeFlags", address: 0x02022fec },
  ]);
  assert.match(lua, /^return \{/m);
  assert.match(lua, /label = "playerPartyCount", address = 33703145/);
  assert.match(lua, /label = "battleTypeFlags", address = 33697772/);
  assert.match(lua, /\}\s*$/);
});

test("watchListToLua escapes nothing unexpected for plain alphanumeric labels and stays balanced", () => {
  const watches = buildWatchList();
  const lua = watchListToLua(watches);
  const openBraces = (lua.match(/\{/g) || []).length;
  const closeBraces = (lua.match(/\}/g) || []).length;
  assert.equal(openBraces, closeBraces);
  for (const watch of watches) {
    assert.match(lua, new RegExp(`label = "${watch.label}", address = ${watch.address}`));
  }
});

test("readArguments requires a valid --provider value", () => {
  assert.throws(() => readArguments([]), /Usage:/);
  assert.throws(() => readArguments(["--provider", "unknown"]), /Usage:/);
  assert.doesNotThrow(() => readArguments(["--provider", "bizhawk"]));
  assert.doesNotThrow(() => readArguments(["--provider", "mgba"]));
});

test("readArguments parses --check and scan flags", () => {
  const options = readArguments(["--provider", "bizhawk", "--check", "--scan-start", "0x02000000", "--scan-length", "256"]);
  assert.equal(options.checkOnly, true);
  assert.equal(options.provider, "bizhawk");
  assert.equal(options.scanStart, "0x02000000");
  assert.equal(options.scanLength, "256");
});

test("readArguments rejects unknown flags", () => {
  assert.throws(() => readArguments(["--provider", "bizhawk", "--bogus"]), /Unknown or incomplete argument/);
});
