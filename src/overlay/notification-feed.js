// Domain-neutral, in-memory notification feed store (P04-T003). Knows
// nothing about Pokemon, rules, events, or the action executor - it is the
// small, bounded, TTL-pruned list that a real overlay.notification sink
// publishes into, and that the local dev server serves as a static JSON
// file for the browser to poll. See tools/emerald-live-state.mjs for the
// only place that actually wires this into a live session.

const SEVERITIES = Object.freeze(["info", "warn", "error"]);

export class NotificationFeedError extends TypeError {
  constructor(message) {
    super(message);
    this.name = "NotificationFeedError";
  }
}

// Creates one feed instance. `ttlMs` bounds how long a published entry
// remains in `list()` before it is pruned (a deterministic, fixed lifetime
// from `deliveredAt` - not a countdown that changes on every read).
// `maxEntries` additionally bounds memory/output size regardless of TTL, in
// case entries are published faster than they expire.
export function createNotificationFeed({ ttlMs = 8000, maxEntries = 20, now = () => Date.now() } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new TypeError("ttlMs must be a positive number");
  }
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new TypeError("maxEntries must be a positive integer");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }

  let nextId = 1;
  let entries = [];

  function prune() {
    const cutoff = now() - ttlMs;
    entries = entries.filter((entry) => entry.deliveredAt > cutoff);
  }

  return Object.freeze({
    // Publishes one notification and returns the stored entry (frozen,
    // with its assigned `id`/`deliveredAt`). Fails closed on a malformed
    // message/severity - the caller (overlay-notification.js's execute())
    // awaits this, so a thrown NotificationFeedError here becomes a
    // structured EXECUTION_FAILED result via the executor's own containment
    // rather than corrupting the feed with an unusable entry.
    publish({ message, severity = "info" } = {}) {
      if (typeof message !== "string" || message.trim() === "") {
        throw new NotificationFeedError("Notification message must be a non-empty string");
      }
      if (!SEVERITIES.includes(severity)) {
        throw new NotificationFeedError(`Notification severity must be one of ${SEVERITIES.join(", ")}`);
      }

      prune();
      const entry = Object.freeze({ id: `n${nextId}`, message, severity, deliveredAt: now() });
      nextId += 1;
      entries = entries.length >= maxEntries ? [...entries.slice(entries.length - maxEntries + 1), entry] : [...entries, entry];
      return entry;
    },

    // Returns the current, already-pruned entries in publish order (oldest
    // first) - a fresh array each call, never the live internal reference.
    list() {
      prune();
      return [...entries];
    },

    clear() {
      entries = [];
    },
  });
}
