// Thin DOM binding for the notification feed (P04-T003). Reuses
// createLiveStateController unchanged (the same primitive the dashboard
// itself polls with) for a second, independent poll loop, and
// planNotificationRender (pure) for reconciliation - this file only ever
// translates that plan into real DOM nodes/removals. It never touches the
// dashboard's own render target, so a notification never replaces the
// dashboard.
import { createLiveStateController } from "./live-state.js";
import { planNotificationRender } from "./notification-view.js";

const SEVERITY_LABEL = Object.freeze({ info: "Info", warn: "Warning", error: "Error" });

// Builds one notification's DOM node. Every piece of untrusted text
// (message) is assigned via `textContent`, never `innerHTML` or template
// interpolation into markup - this is a structural guarantee against
// HTML/script injection, not an escaping convention that could be
// forgotten at a call site.
export function buildNotificationNode(entry, { createElement, onDismiss }) {
  const node = createElement("div");
  node.className = `notification notification-${entry.severity}`;

  const severityEl = createElement("span");
  severityEl.className = "notification-severity";
  severityEl.textContent = SEVERITY_LABEL[entry.severity] ?? "Info";
  node.appendChild(severityEl);

  const messageEl = createElement("span");
  messageEl.className = "notification-message";
  messageEl.textContent = entry.message;
  node.appendChild(messageEl);

  const dismissEl = createElement("button");
  dismissEl.type = "button";
  dismissEl.className = "notification-dismiss";
  dismissEl.textContent = "×";
  dismissEl.setAttribute("aria-label", "Dismiss notification");
  dismissEl.addEventListener("click", () => onDismiss?.(entry.id));
  node.appendChild(dismissEl);

  return node;
}

// Creates a polling notification panel bound to `container`. `container`
// only ever receives appendChild/removeChild calls for notification nodes
// this module created itself - it is never cleared/replaced wholesale, so
// it can safely be a sibling of the dashboard's own render target rather
// than a stand-in for it.
export function createNotificationPanel({
  container,
  fetchNotifications,
  createElement = (tag) => document.createElement(tag),
  intervalMs = 1000,
  now,
  schedule,
  cancel,
  onStatus,
}) {
  if (!container || typeof container.appendChild !== "function") {
    throw new TypeError("A DOM container is required for the notification panel");
  }
  if (typeof fetchNotifications !== "function") {
    throw new TypeError("fetchNotifications must be a function");
  }

  const nodes = new Map();
  // Explicitly dismissed ids are never re-shown even if the server has not
  // pruned them yet - distinct from `nodes` (currently rendered), so a
  // dismissal does not make an already-seen id look "new" again next poll.
  const dismissedIds = new Set();

  function dismiss(id) {
    dismissedIds.add(id);
    const node = nodes.get(id);
    if (node) {
      node.remove();
      nodes.delete(id);
    }
  }

  const controller = createLiveStateController({
    fetchState: fetchNotifications,
    intervalMs,
    now,
    schedule,
    cancel,
    onStatus,
    onRender(state) {
      const feedEntries = Array.isArray(state?.notifications) ? state.notifications : [];
      const { toShow, toRemove } = planNotificationRender(feedEntries, {
        renderedIds: new Set(nodes.keys()),
        dismissedIds,
      });

      for (const id of toRemove) {
        const node = nodes.get(id);
        if (node) node.remove();
        nodes.delete(id);
      }

      for (const entry of toShow) {
        const node = buildNotificationNode(entry, { createElement, onDismiss: dismiss });
        nodes.set(entry.id, node);
        container.appendChild(node);
      }
    },
  });

  return controller;
}
