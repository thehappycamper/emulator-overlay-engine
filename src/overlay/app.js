import { resolveBrowserDomain as resolveDomain } from "../domains/browser.js";
import { getDomainOverlayPresentation, renderDomainOverlay } from "./host.js";
import { createLiveStateController } from "./live-state.js";
import { createNotificationPanel } from "./notification-dom.js";

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_NOTIFICATIONS_URL = "/public/notifications.json";

const root = document.querySelector("#app");

async function loadState(stateUrl) {
  const response = await fetch(stateUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load ${stateUrl}: ${response.status}`);
  }
  return response.json();
}

// The notification feed is optional and independent of live game state: no
// file yet (a fresh session that hasn't published anything) is treated the
// same as an empty feed, not an error, so the dashboard's own live/stale/
// error status is never affected by whether any notification has ever
// fired. A malformed payload (wrong shape, invalid JSON) degrades the same
// way rather than throwing - the overlay keeps working either way.
async function loadNotifications(notificationsUrl) {
  let response;
  try {
    response = await fetch(notificationsUrl, { cache: "no-store" });
  } catch {
    return { notifications: [] };
  }
  if (response.status === 404) {
    return { notifications: [] };
  }
  if (!response.ok) {
    return { notifications: [] };
  }
  try {
    const data = await response.json();
    return Array.isArray(data?.notifications) ? data : { notifications: [] };
  } catch {
    return { notifications: [] };
  }
}

function installStylesheets(stylesheets) {
  for (const href of stylesheets) {
    const installed = Array.from(document.querySelectorAll("link[data-overlay-stylesheet]"))
      .some((link) => link.dataset.overlayStylesheet === href);
    if (installed) {
      continue;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.overlayStylesheet = href;
    document.head.append(link);
  }
}

function formatStatus(status, stateUrl) {
  const label = { live: "Live", stale: "Stale", error: "Error" }[status.phase] ?? status.phase;
  const parts = [`${label}: ${stateUrl}`];
  if (status.lastUpdatedAt) {
    parts.push(`updated ${new Date(status.lastUpdatedAt).toLocaleTimeString()}`);
  }
  if (status.phase !== "live" && status.lastErrorMessage) {
    parts.push(status.lastErrorMessage);
  }
  return parts.join(" | ");
}

function startOverlay() {
  if (!root) {
    throw new Error("Overlay root #app was not found");
  }

  let domain;
  let presentation;
  let stateUrl;

  try {
    domain = resolveDomain(root.dataset.domain);
    presentation = getDomainOverlayPresentation(domain);
    stateUrl = new URLSearchParams(window.location.search).get("state")
      || root.dataset.stateUrl
      || "/public/sample-state.json";
    installStylesheets(presentation.stylesheets ?? []);
  } catch (error) {
    root.innerHTML = `<pre class="error">${error.message}</pre>`;
    return;
  }

  const statusEl = document.createElement("div");
  statusEl.className = "live-status";
  const contentEl = document.createElement("div");
  const notificationsEl = document.createElement("div");
  notificationsEl.className = "notifications";
  // The notifications panel is a sibling of contentEl, never a replacement
  // for it - a notification never clears or replaces the dashboard.
  root.replaceChildren(statusEl, contentEl, notificationsEl);

  const pollIntervalMs = Number(root.dataset.pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS;

  const controller = createLiveStateController({
    fetchState: () => loadState(stateUrl),
    intervalMs: pollIntervalMs,
    onRender(state) {
      contentEl.innerHTML = renderDomainOverlay(domain, state);
    },
    onStatus(status) {
      statusEl.dataset.state = status.phase;
      statusEl.textContent = formatStatus(status, stateUrl);
      if (status.phase === "error" && !status.hasRenderedOnce) {
        contentEl.innerHTML = `<pre class="error">${status.lastErrorMessage ?? `Unable to load ${stateUrl}`}</pre>`;
      }
    }
  });

  const notificationsUrl = root.dataset.notificationsUrl || DEFAULT_NOTIFICATIONS_URL;
  const notificationsPanel = createNotificationPanel({
    container: notificationsEl,
    fetchNotifications: () => loadNotifications(notificationsUrl),
    intervalMs: pollIntervalMs,
  });

  controller.start();
  notificationsPanel.start();
}

startOverlay();
