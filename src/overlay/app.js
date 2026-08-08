import { resolveDomain } from "../domains/index.js";
import { getDomainOverlayPresentation, renderDomainOverlay } from "./host.js";

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

async function startOverlay() {
  if (!root) {
    throw new Error("Overlay root #app was not found");
  }

  try {
    const domain = resolveDomain(root.dataset.domain);
    const presentation = getDomainOverlayPresentation(domain);
    const stateUrl = new URLSearchParams(window.location.search).get("state")
      || root.dataset.stateUrl
      || "/public/sample-state.json";

    installStylesheets(presentation.stylesheets ?? []);
    root.innerHTML = renderDomainOverlay(domain, await loadState(stateUrl));
  } catch (error) {
    root.innerHTML = `<pre class="error">${error.message}</pre>`;
  }
}

startOverlay();
