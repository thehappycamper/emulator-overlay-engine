// Watches a live Emerald source snapshot, maps it to validated Pokemon
// normalized state (unchanged from before P04-T003), and - the addition
// this task makes - derives semantic events from consecutive mapped states,
// evaluates the declarative rules for this session, and runs the resulting
// action requests through a capability-gated executor whose only granted
// capability is overlay.notify. A real overlay.notification delivery
// (src/overlay/notification-feed.js + write-notification-feed.js) publishes
// to the same local static-file/poll architecture public/live-state.json
// already uses - no new network machinery.
//
// This file is the one place in the whole P04 stack that is allowed to
// import a Pokemon domain module (detectPokemonEvents) - src/events,
// src/rules, and src/actions remain completely domain-neutral, exactly as
// P04-T001/T002 left them. This mirrors the same boundary
// tools/proof-emerald-bizhawk.mjs already draws for BizHawk-specific
// config: domain/provider knowledge lives in the thin composition script,
// never in the shared platform modules.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  mapEmeraldSourceSnapshot,
  writePokemonLiveState,
} from "../adapters/pokemon-emerald-us-rev0/emerald-state-mapping.js";
import { createActionExecutor } from "../src/actions/execute.js";
import { HARMLESS_LOCAL_PROVIDERS } from "../src/actions/providers/index.js";
import { detectPokemonEvents } from "../src/domains/pokemon/events.js";
import { createEventSequencer } from "../src/events/derive.js";
import { createNotificationFeed } from "../src/overlay/notification-feed.js";
import { writeNotificationFeed } from "../src/overlay/write-notification-feed.js";
import { evaluateRules } from "../src/rules/evaluate.js";

const OVERLAY_NOTIFY_PROVIDER = HARMLESS_LOCAL_PROVIDERS.filter((provider) => provider.actionType === "overlay.notification");

// Loads one rule, or an array of rules, from a JSON file. Kept intentionally
// minimal - this is not a rules-directory/loader framework, just enough to
// point this session at the one declarative rule this task proves end to
// end (examples/rules/pokemon-fainted-notification.rule.json).
export async function loadRules(rulesPath, { fileSystem = { readFile } } = {}) {
  const text = await fileSystem.readFile(rulesPath, "utf8");
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

// Builds the real, local notify() sink an executor context can use: publish
// into the bounded in-memory feed, then atomically rewrite the feed file
// the browser polls. Deliberately does not catch its own errors - a
// publish/write failure must propagate to the caller (the
// overlay.notification provider's execute(), then the executor's own
// try/catch) and become a structured EXECUTION_FAILED result, not a
// silently-dropped notification.
export function createNotificationDelivery({ feed, notificationsFeedPath, fileSystem } = {}) {
  if (!feed || typeof feed.publish !== "function") {
    throw new TypeError("createNotificationDelivery requires a notification feed");
  }
  if (typeof notificationsFeedPath !== "string" || !notificationsFeedPath) {
    throw new TypeError("createNotificationDelivery requires a notificationsFeedPath");
  }
  return async function notify(message, severity) {
    feed.publish({ message, severity });
    await writeNotificationFeed(notificationsFeedPath, feed.list(), fileSystem ? { fileSystem } : undefined);
  };
}

// Derives events from (previousState, currentState), evaluates them against
// `rules`, and runs every resulting action request through `executor` in
// order. Returns [] for everything when there is no previous state (first
// snapshot of a session - deriveEvents' own documented behavior, see
// src/events/derive.js) - a first observation never fabricates an event.
export async function processEmeraldEvents({
  previousState,
  currentState,
  rules,
  executor,
  stampEvent,
  correlationIdPrefix = "emerald-live",
  context = {},
}) {
  if (!previousState) {
    return { events: [], requests: [], results: [] };
  }
  const events = detectPokemonEvents(previousState, currentState, { stampEvent });
  const requests = events.flatMap((event) =>
    evaluateRules(event, rules, { correlationId: `${correlationIdPrefix}:${event.sequence}` }),
  );
  const results = requests.length > 0 ? await executor.executeAll(requests, context) : [];
  return { events, requests, results };
}

// Creates one session's worth of state for the watch loop below: the
// notification feed/executor/rules/event-sequencer are all constructed
// once and reused across every poll, exactly like the module-level
// `lastObservedSource` state this file already had before this task -
// events must stay monotonically sequenced and the replay/duplicate
// tracking below must stay meaningful across the whole session, not reset
// every 250ms.
export async function createEmeraldLiveStateSession({
  rulesPath,
  notificationsFeedPath,
  notificationTtlMs = 8000,
  now,
}) {
  const rules = await loadRules(rulesPath);
  const feed = createNotificationFeed(now ? { ttlMs: notificationTtlMs, now } : { ttlMs: notificationTtlMs });
  const notify = createNotificationDelivery({ feed, notificationsFeedPath });
  const executor = createActionExecutor(OVERLAY_NOTIFY_PROVIDER, {
    grantedCapabilities: ["overlay.notify"],
    defaultContext: { sessionAuthorized: true },
  });
  const stampEvent = createEventSequencer();

  let previousState;

  return {
    feed,
    executor,
    // Maps one source snapshot to Pokemon state (unchanged mapping logic),
    // then - only once a previous mapped state exists in this session -
    // derives events, evaluates rules, and executes any resulting
    // notification requests. Always returns the mapped state so the caller
    // can still publish public/live-state.json exactly as before.
    async mapAndNotify(source) {
      const state = mapEmeraldSourceSnapshot(source);
      const { events, requests, results } = await processEmeraldEvents({
        previousState,
        currentState: state,
        rules,
        executor,
        stampEvent,
        context: { notify },
      });
      previousState = state;
      return { state, events, requests, results };
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourcePath = resolve(
    process.env.EMERALD_SOURCE_SNAPSHOT_PATH || "var/snapshots/emerald-us-rev0.source.json",
  );
  const targetPath = resolve(process.env.EOE_LIVE_STATE_PATH || "public/live-state.json");
  const notificationsFeedPath = resolve(process.env.EOE_NOTIFICATIONS_FEED_PATH || "public/notifications.json");
  const rulesPath = resolve(
    process.env.EOE_RULES_PATH || "examples/rules/pokemon-fainted-notification.rule.json",
  );
  const notificationTtlMs = Number(process.env.EOE_NOTIFICATION_TTL_MS || 8000);
  const intervalMs = Number(process.env.EMERALD_MAPPING_POLL_INTERVAL_MS || 250);
  const runOnce = process.argv.includes("--once");

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new RangeError("EMERALD_MAPPING_POLL_INTERVAL_MS must be a positive number");
  }
  if (!Number.isFinite(notificationTtlMs) || notificationTtlMs <= 0) {
    throw new RangeError("EOE_NOTIFICATION_TTL_MS must be a positive number");
  }

  const session = await createEmeraldLiveStateSession({ rulesPath, notificationsFeedPath, notificationTtlMs });

  let lastObservedSource;
  let lastErrorMessage;
  let timer;
  let stopped = false;

  async function processSnapshot(force = false) {
    const sourceText = await readFile(sourcePath, "utf8");
    if (!force && sourceText === lastObservedSource) {
      return false;
    }
    lastObservedSource = sourceText;

    const { state, requests } = await session.mapAndNotify(JSON.parse(sourceText));
    await writePokemonLiveState(targetPath, state);
    lastErrorMessage = undefined;
    console.log(`Mapped Emerald source snapshot to ${targetPath}`);
    if (requests.length > 0) {
      console.log(`Delivered ${requests.length} notification(s) to ${notificationsFeedPath}`);
    }
    return true;
  }

  async function poll() {
    try {
      await processSnapshot();
    } catch (error) {
      if (error.message !== lastErrorMessage) {
        console.error(`Emerald live-state mapping failed: ${error.message}`);
        lastErrorMessage = error.message;
      }
    } finally {
      if (!stopped) {
        timer = setTimeout(poll, intervalMs);
      }
    }
  }

  console.log(`Watching Emerald source snapshot: ${sourcePath}`);
  console.log(`Validated Pokemon live state: ${targetPath}`);
  console.log(`Notification feed: ${notificationsFeedPath}`);

  if (runOnce) {
    try {
      await processSnapshot(true);
    } catch (error) {
      console.error(`Emerald live-state mapping failed: ${error.message}`);
      process.exitCode = 1;
    }
  } else {
    process.once("SIGINT", () => {
      stopped = true;
      clearTimeout(timer);
      process.exitCode = 0;
    });
    await poll();
  }
}
