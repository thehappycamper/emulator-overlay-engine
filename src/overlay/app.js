import { resolveDomain } from "../domains/index.js";
import { getDomainOverlayPresentation, renderDomainOverlay } from "./host.js";
import { createLiveStateController } from "./live-state.js";

const DEFAULT_POLL_INTERVAL_MS = 1000;

const root = document.querySelector("#app");

async function loadState(stateUrl) {
  const response = await fetch(stateUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load ${stateUrl}: ${response.status}`);
  }
  return response.json();
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
  root.replaceChildren(statusEl, contentEl);

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

  controller.start();
}

startOverlay();
