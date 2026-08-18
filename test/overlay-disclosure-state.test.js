// Fast, deterministic tests of captureDisclosureState/restoreDisclosureState
// against a minimal DOM-like stand-in - not jsdom, not a real browser. It
// implements exactly the two surfaces the module actually uses
// (`container.querySelectorAll(...)` returning elements with
// `.dataset.disclosureId` and a mutable `.open`), matching real
// HTMLDetailsElement semantics for those specific properties, so the
// captured/restored *logic* is genuinely exercised. This does not prove the
// module survives a real innerHTML replacement in a real browser - see
// test/browser-shell.test.js's disclosure-preservation test for that.
import assert from "node:assert/strict";
import test from "node:test";

import { captureDisclosureState, restoreDisclosureState } from "../src/overlay/disclosure-state.js";

function detailsElement({ id, open }) {
  return { dataset: id ? { disclosureId: id } : {}, open };
}

function container(elements) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, 'details[data-disclosure-id]');
      return elements.filter((el) => el.dataset.disclosureId);
    },
  };
}

test("captureDisclosureState records open/closed for every identified disclosure, keyed by its id", () => {
  const el1 = detailsElement({ id: "a", open: true });
  const el2 = detailsElement({ id: "b", open: false });
  const state = captureDisclosureState(container([el1, el2]));
  assert.deepEqual([...state.entries()], [["a", true], ["b", false]]);
});

test("captureDisclosureState ignores elements without a data-disclosure-id", () => {
  const identified = detailsElement({ id: "a", open: true });
  const unidentified = detailsElement({ id: null, open: true });
  const state = captureDisclosureState(container([identified, unidentified]));
  assert.equal(state.size, 1);
  assert.equal(state.get("a"), true);
});

test("captureDisclosureState on an empty/no-op container returns an empty map without throwing", () => {
  assert.equal(captureDisclosureState(container([])).size, 0);
  assert.equal(captureDisclosureState(null).size, 0);
  assert.equal(captureDisclosureState({}).size, 0);
});

test("restoreDisclosureState applies a captured value onto a matching id after a fresh render", () => {
  // Scenario A/B: a fresh render always emits `open: false` (the real
  // renderer's default) - restore must flip it back to whatever was
  // captured before the swap, for both the true and false cases.
  const freshExpanded = detailsElement({ id: "battle-stat-compare", open: false });
  restoreDisclosureState(container([freshExpanded]), new Map([["battle-stat-compare", true]]));
  assert.equal(freshExpanded.open, true);

  const freshCollapsed = detailsElement({ id: "battle-stat-compare", open: false });
  restoreDisclosureState(container([freshCollapsed]), new Map([["battle-stat-compare", false]]));
  assert.equal(freshCollapsed.open, false);
});

test("restoreDisclosureState leaves an element at its rendered default when its id was never captured (first render or newly appeared panel)", () => {
  // Scenario G: nothing to restore (empty state, e.g. the very first
  // render) must not touch the element's own default at all.
  const el = detailsElement({ id: "battle-stat-compare", open: false });
  restoreDisclosureState(container([el]), new Map());
  assert.equal(el.open, false);

  // A panel present now whose id simply never appeared in the previous
  // capture (e.g. it's the first time this particular id has rendered)
  // keeps its own default rather than being forced by an unrelated entry.
  const newPanel = detailsElement({ id: "location-encounters", open: false });
  restoreDisclosureState(container([newPanel]), new Map([["battle-stat-compare", true]]));
  assert.equal(newPanel.open, false);
});

test("restoreDisclosureState silently drops a captured entry whose panel disappeared this render (no throw, no leakage)", () => {
  // Scenario F: "battle-stat-compare" was open, but the battle ended so
  // that panel is entirely absent from the fresh render. The captured
  // entry must not be applied to some other, unrelated panel that happens
  // to still be present.
  const unrelatedPanel = detailsElement({ id: "location-encounters", open: false });
  const captured = new Map([["battle-stat-compare", true], ["location-encounters", false]]);
  assert.doesNotThrow(() => restoreDisclosureState(container([unrelatedPanel]), captured));
  assert.equal(unrelatedPanel.open, false);
});

test("restoreDisclosureState preserves multiple independent panels' distinct states in the same pass", () => {
  // Scenario E.
  const statCompare = detailsElement({ id: "battle-stat-compare", open: false });
  const encounters = detailsElement({ id: "location-encounters", open: false });
  const balls = detailsElement({ id: "battle-balls", open: false });
  const captured = new Map([
    ["battle-stat-compare", true],
    ["location-encounters", false],
    ["battle-balls", true],
  ]);
  restoreDisclosureState(container([statCompare, encounters, balls]), captured);
  assert.equal(statCompare.open, true);
  assert.equal(encounters.open, false);
  assert.equal(balls.open, true);
});

test("restoreDisclosureState on an empty/no-op container or empty state does not throw", () => {
  assert.doesNotThrow(() => restoreDisclosureState(container([]), new Map([["x", true]])));
  assert.doesNotThrow(() => restoreDisclosureState(container([detailsElement({ id: "a", open: false })]), new Map()));
  assert.doesNotThrow(() => restoreDisclosureState(null, new Map([["a", true]])));
});
