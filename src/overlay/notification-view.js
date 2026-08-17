// Pure notification reconciliation logic (P04-T003). Given the latest
// polled feed snapshot and what the browser has already rendered/dismissed,
// decides which entries are newly visible and which previously-rendered
// entries have fallen out of the feed (expired server-side) and should be
// removed. No DOM access here - src/overlay/notification-dom.js is the thin
// layer that turns this plan into real nodes.

const KNOWN_SEVERITIES = new Set(["info", "warn", "error"]);

// `renderedIds`/`dismissedIds` are Sets of notification ids already shown
// or explicitly dismissed in this browser session. A malformed feed
// (missing/wrong-typed `notifications`, or an individual malformed entry)
// never throws - it degrades to "nothing new to show" so a delivery
// failure or bad payload cannot crash the overlay.
export function planNotificationRender(feedEntries, { renderedIds = new Set(), dismissedIds = new Set() } = {}) {
  if (!Array.isArray(feedEntries)) {
    return { toShow: [], toRemove: [...renderedIds] };
  }

  const currentIds = new Set();
  const toShow = [];
  for (const entry of feedEntries) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.id !== "string" || !entry.id) continue;
    if (typeof entry.message !== "string" || !entry.message) continue;
    const severity = KNOWN_SEVERITIES.has(entry.severity) ? entry.severity : "info";

    currentIds.add(entry.id);
    if (!renderedIds.has(entry.id) && !dismissedIds.has(entry.id)) {
      toShow.push({ id: entry.id, message: entry.message, severity });
    }
  }

  // Anything previously rendered that is no longer in the current feed has
  // expired server-side (the feed store prunes by TTL before every write)
  // and must be removed - this is what makes expiry deterministic without
  // any client-side timer.
  const toRemove = [...renderedIds].filter((id) => !currentIds.has(id));
  return { toShow, toRemove };
}
