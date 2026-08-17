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

  function pruned(list) {
    const cutoff = now() - ttlMs;
    return list.filter((entry) => entry.deliveredAt > cutoff);
  }

  function validateInput({ message, severity = "info" } = {}) {
    if (typeof message !== "string" || message.trim() === "") {
      throw new NotificationFeedError("Notification message must be a non-empty string");
    }
    if (!SEVERITIES.includes(severity)) {
      throw new NotificationFeedError(`Notification severity must be one of ${SEVERITIES.join(", ")}`);
    }
    return { message, severity };
  }

  // Computes the exact next feed state a publish of `{message, severity}`
  // would produce - assigned id, timestamp, pruning, and the maxEntries
  // cap - without mutating `entries`/`nextId`. Used by both publish() (which
  // applies it immediately) and prepare()/commit() (P04-T003 fix round -
  // see below), so the two never compute ids/pruning differently.
  function computeCandidate(validated) {
    const prunedEntries = pruned(entries);
    const entry = Object.freeze({ id: `n${nextId}`, ...validated, deliveredAt: now() });
    const nextEntries = prunedEntries.length >= maxEntries
      ? [...prunedEntries.slice(prunedEntries.length - maxEntries + 1), entry]
      : [...prunedEntries, entry];
    return { entry, entries: nextEntries, nextId: nextId + 1 };
  }

  return Object.freeze({
    // Publishes one notification immediately and returns the stored entry
    // (frozen, with its assigned `id`/`deliveredAt`). Fails closed on a
    // malformed message/severity. For a caller that must not let the
    // in-memory feed diverge from what was actually durably persisted (the
    // real overlay.notification delivery path - see
    // tools/emerald-live-state.mjs's createNotificationDelivery), use
    // prepare()/commit() instead so persistence can happen before this
    // feed is mutated at all.
    publish(input) {
      const validated = validateInput(input);
      const candidate = computeCandidate(validated);
      entries = candidate.entries;
      nextId = candidate.nextId;
      return candidate.entry;
    },

    // Two-phase publish, commit-after-success (P04-T003 fix round).
    // prepare() validates input and computes the exact next feed state -
    // same id/deliveredAt/pruning/cap logic as publish() - WITHOUT
    // mutating anything. The caller can then durably persist
    // `candidate.entries` and only call commit(candidate) once that
    // persistence has actually succeeded. If persistence fails, the
    // candidate is simply discarded: entries/nextId were never touched, so
    // a retry's own prepare() call computes a fresh candidate from the
    // exact same starting state (and even reuses the same id, since
    // nextId was never advanced by the failed attempt).
    prepare(input) {
      const validated = validateInput(input);
      return computeCandidate(validated);
    },

    // Commits a candidate previously returned by prepare() on this same
    // feed instance - this feed trusts its caller the same way the rest
    // of this module already does (e.g. publish() trusts its own inputs
    // once validated).
    commit(candidate) {
      if (!candidate || !Array.isArray(candidate.entries) || !Number.isInteger(candidate.nextId)) {
        throw new NotificationFeedError("commit() requires a candidate object returned by prepare()");
      }
      entries = candidate.entries;
      nextId = candidate.nextId;
      return candidate.entry;
    },

    // Returns the current, already-pruned entries in publish order (oldest
    // first) - a fresh array each call, never the live internal reference.
    // Also persists the pruned result back into `entries` so a feed that
    // is only ever read (never published to again) does not retain stale
    // entries in memory forever.
    list() {
      entries = pruned(entries);
      return [...entries];
    },

    clear() {
      entries = [];
    },
  });
}
