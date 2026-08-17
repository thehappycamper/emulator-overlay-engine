# ADR 0029: Overlay Notification Local Delivery

- **Status:** Accepted for the P04-T003 vertical slice
- **Date:** 2026-08-16

## Context

P04-T002 proved the capability-gated executor and a harmless `overlay.notification` provider, but explicitly stopped short of any real delivery: `notify()` defaulted to a `console.log` line, and its own follow-up recommendation was "a real overlay-integration provider (wiring `overlay.notification` to the actual browser overlay) once the presentation layer exposes a suitable local delivery channel."

The platform needed to prove the full chain end to end - `normalized state -> semantic event -> rule -> action request -> executor -> overlay.notification -> local delivery -> browser` - without inventing a new network architecture, without letting a notification touch normalized game state, and without weakening any of the capability/authorization/replay guarantees P04-T002 already established.

## Decision

**A second, independent local file-and-poll channel, not a shared one with `public/live-state.json`.** `src/overlay/notification-feed.js` is a small, pure, in-memory, TTL-pruned, capped feed store (`createNotificationFeed`); `src/overlay/write-notification-feed.js` atomically writes its current entries to `public/notifications.json`, mirroring the write-temp-then-rename pattern the Emerald adapters already use for `public/live-state.json`. The existing static file server (`tools/dev-server.mjs`) needs zero changes - it already serves any file under `public/`.

This is deliberately a *second* file/poller, not a new field merged into the existing normalized-state document or its Pokemon-owned schema. Coupling notification delivery into `overlay-state.schema.json` (even via its `extensions` namespace) would tie a transient, platform-level UI concern to the domain-owned game-state contract's own change-detection cycle, forcing a full dashboard re-render on every notification - exactly the "replacing the dashboard" outcome the task explicitly ruled out. Two small, independent poll loops sharing the same underlying primitive (`createLiveStateController`, reused completely unchanged) is simpler and correctly decoupled.

**The browser side reuses `createLiveStateController` verbatim for a second poll loop** (`src/overlay/notification-dom.js`'s `createNotificationPanel`), rendering into a container that is a sibling of the dashboard's own render target, never a replacement for it. A pure reconciliation function, `src/overlay/notification-view.js`'s `planNotificationRender`, decides - given the latest feed snapshot and the ids already rendered/dismissed in this browser session - which entries are newly visible and which previously-rendered ones fell out of the feed (expired server-side) and must be removed. This makes expiry deterministic without any client-side timer: the feed store prunes by a fixed `deliveredAt + ttlMs` lifetime before every write, and the browser simply reconciles to whatever the feed currently contains on each poll.

**Every notification DOM node is built with `textContent`, never `innerHTML` or string interpolation into markup** (`src/overlay/notification-dom.js`'s `buildNotificationNode`). This is a structural guarantee against HTML/script injection from a notification message, not an escaping convention a future call site could forget.

**Dismissal is explicit and independent of expiry.** A dismissed id is tracked client-side for the life of the browser session and is never re-shown even if the server has not yet pruned it - distinct from "already rendered," so a dismissal cannot be undone by the next poll.

**Replay/duplicate protection needs no new mechanism.** P04-T002's executor already guarantees a genuine replay of an identical action request never re-invokes the provider's `execute()`. Since the real `notify` sink is only ever called from inside `execute()`, a duplicate action request can never publish a second feed entry - no additional identity/dedup logic was added to the feed store itself beyond this.

**`overlay-notification.js`'s payload contract gained one optional field, `severity` (`info`/`warn`/`error`, default `info`)**, mirroring `system.log`'s existing `level` field exactly. `execute()` became `async` so a real sink's file I/O can genuinely propagate a rejection into the executor's own try/catch, becoming a structured `EXECUTION_FAILED` result rather than an unhandled rejection - this is what makes "notification delivery failure becomes a structured action failure rather than crashing event/rule processing" true by construction, not by a new special case.

**The real wiring lives entirely in `tools/emerald-live-state.mjs`**, the one place already allowed to import a Pokemon domain module for its own composition (mirroring how `tools/proof-emerald-bizhawk.mjs` composes BizHawk-specific config without leaking BizHawk knowledge into shared modules). `src/events`, `src/rules`, and `src/actions` remain completely domain-neutral and were not given any new Pokemon/Emerald-specific branches. The tool now also derives events from consecutive mapped states (`detectPokemonEvents`), evaluates the declarative rule at `examples/rules/pokemon-fainted-notification.rule.json`, and runs the resulting requests through a `createActionExecutor` granted only `overlay.notify`. This required adding a proper ESM main-module guard (`pathToFileURL(process.argv[1]).href === import.meta.url`) to the script, which previously ran its entire polling loop at module-load time with no guard at all - undesirable once the script's logic needed to be exported and imported directly by tests. `tools/proof-emerald-bizhawk.mjs` needed zero changes: it already spawns `emerald-live-state.mjs` as a child process, so the new behavior is automatically part of the existing single-command proof session.

## Consequences

- Notification delivery is local-file-and-poll only; no webhook, WebSocket, or external network surface was added or implied.
- A notification can never mutate `public/live-state.json` or any normalized Pokemon state - the two write paths are structurally disjoint (different modules, different files), verified by a dedicated test.
- The notification feed is in-memory and unbounded only up to `maxEntries`/`ttlMs` - it is not persisted across a session restart, matching the same disclosed, deliberate limitation P04-T002 already carries for its own replay-tracking store.
- `public/notifications.json` is a runtime-generated artifact (like `public/live-state.json`) and is gitignored, not committed.
- This does not implement webhooks, Discord/Twitch/OBS integrations, hosted/cloud delivery, a general-purpose message bus, or a visual notification designer. Those remain separate, later decisions.

## Follow-Up

Recommended next task (see the P04-T003 task record's Follow-Up Tasks): decide whether/how a future action provider needs a richer authorization model than the current uniform `sessionAuthorized` flag, now that a real (not just harmless-proof) delivery channel exists.

## Addendum (focused fix round: transactional publication)

Pre-merge scrutiny found a blocking gap: `createNotificationDelivery`'s original `notify()` called `feed.publish(...)` (mutating the in-memory feed immediately) and only *then* attempted the durable write. A write failure left a notification committed in memory even though the action correctly reported failure - and because P04-T002 never caches a non-`"executed"` outcome, a retry of the same action would `feed.publish(...)` a *second* entry on top of the still-present failed one, and a slow, delayed write could later overwrite a newer, complete file with its own stale snapshot (a genuine, reproduced torn-write race between two racing publishes).

**Chosen design: commit-after-success**, not rollback. `src/overlay/notification-feed.js` gained a two-phase `prepare()`/`commit()` pair alongside the existing (unchanged) `publish()`:

- `prepare({ message, severity })` validates input and computes the exact next feed state - the same assigned id, timestamp, TTL-pruning, and `maxEntries` cap logic `publish()` already used - as a plain candidate object, **without mutating the feed at all**.
- `commit(candidate)` applies a previously-`prepare()`d candidate as the feed's new state.

`createNotificationDelivery` now does `prepare()` → durably write the candidate's entries → `commit()` only once that write has actually succeeded. If the write throws, the candidate is discarded; `entries`/`nextId` were never touched, so a retry's own `prepare()` call computes a fresh candidate from the *exact* same starting state (even reusing the same id, since `nextId` was never advanced) - satisfying "retry starts from the same effective state as before the failed attempt" precisely, not approximately.

**Ordering/concurrency:** the real production path already serializes every `notify()` call - P04-T002's `executeAll()` is a plain sequential `for` loop, itself only ever driven by one `mapAndNotify()` call fully awaited before the next poll starts (`tools/emerald-live-state.mjs`). Rather than merely document that assumption, `createNotificationDelivery` also added a small, local, bounded serialization queue (a single promise chain) around its own `publishOnce()` step, so two `notify()` calls through *the same delivery instance* can never both `prepare()` from the same pre-write state and commit out of order - closing the theoretical race without introducing a general-purpose locking subsystem, a new replay mechanism, or any change to P04-T002's own single-flight/replay guard (which independently already prevents a genuine replay from calling `notify()` a second time at all).

Verified against the pre-fix implementation directly (not just asserted): reverting only `createNotificationDelivery` back to its immediate-publish form reproduced all four regressions - an in-memory entry surviving a failed write, a retry publishing `[A, A]` instead of `[A]`, a pre-existing entry being incorrectly joined by a failed attempt's entry, and (via the persisted file specifically) a slower failed-then-delayed write overwriting a faster successful write's complete data. Re-applying the fix and re-running restored all four to green.
