// Domain-neutral, browser-local preservation for native <details> disclosure
// state (open/closed) across an ordinary innerHTML re-render triggered by a
// live-state update. Fully replacing a subtree's innerHTML - the mechanism
// `app.js` already uses on every changed poll - discards all live DOM node
// state, including a user's expanded/collapsed choice on a <details>
// element, since that state is never part of the rendered domain state at
// all. Capturing it beforehand and restoring it after the swap keeps that
// choice intact without persisting anything beyond the current page's
// lifetime (no localStorage/cookies/URL/server involvement) and without
// requiring incremental DOM patching.
//
// Panels opt in by carrying a `data-disclosure-id` attribute - a stable,
// author-chosen semantic identity, not a DOM position or array index. This
// is what keeps preservation correct when a panel disappears (its captured
// entry simply has nothing to restore onto) and prevents one panel's state
// from ever leaking onto an unrelated one that happens to render in the
// same position (matching is always by id, never by index).
const DISCLOSURE_SELECTOR = "details[data-disclosure-id]";

// Reads the current open/closed state of every identified disclosure inside
// `container`, keyed by its `data-disclosure-id`. Call this immediately
// before replacing `container`'s content.
export function captureDisclosureState(container) {
  const state = new Map();
  if (!container || typeof container.querySelectorAll !== "function") {
    return state;
  }
  for (const details of container.querySelectorAll(DISCLOSURE_SELECTOR)) {
    const id = details.dataset?.disclosureId;
    if (id) {
      state.set(id, Boolean(details.open));
    }
  }
  return state;
}

// Re-applies a previously captured state onto whatever identified
// disclosures exist in `container` now. A disclosure whose id has no entry
// in `state` (new to this render, or the first render ever) is left exactly
// as the fresh markup rendered it - its own real default, never forced
// open or closed. An entry in `state` with no matching element in the new
// markup (the panel disappeared this render) is simply unused.
export function restoreDisclosureState(container, state) {
  if (!container || typeof container.querySelectorAll !== "function" || !(state?.size > 0)) {
    return;
  }
  for (const details of container.querySelectorAll(DISCLOSURE_SELECTOR)) {
    const id = details.dataset?.disclosureId;
    if (id && state.has(id)) {
      details.open = state.get(id);
    }
  }
}
