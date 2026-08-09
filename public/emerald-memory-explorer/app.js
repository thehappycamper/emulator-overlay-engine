import { decodeTypedValues, diffWatchSnapshots, toHexString } from "/tools/emerald-memory-explorer-lib.mjs";

const LABEL_STORAGE_KEY = "emerald-memory-explorer:candidate-labels";

let previousWatches = null;
let autoRefreshTimer = null;

function loadCandidateLabels() {
  try {
    return JSON.parse(localStorage.getItem(LABEL_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCandidateLabel(watchLabel, candidateName) {
  const labels = loadCandidateLabels();
  if (candidateName) {
    labels[watchLabel] = candidateName;
  } else {
    delete labels[watchLabel];
  }
  localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(labels));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

function cell(value, changeClass) {
  const td = document.createElement("td");
  td.textContent = value === undefined || value === null ? "-" : String(value);
  if (changeClass && changeClass !== "unchanged") {
    td.className = `changed-${changeClass}`;
  }
  return td;
}

function renderWatches(diagnostic) {
  const tbody = document.querySelector("#watches-table tbody");
  tbody.innerHTML = "";
  const identity = document.getElementById("identity");

  if (!diagnostic) {
    identity.textContent = "No diagnostic file yet - launch the explorer connector first.";
    document.getElementById("scan-output").textContent = "";
    return;
  }

  identity.textContent = `provider=${diagnostic.provider} ${diagnostic.emulatorVersion ?? ""} ${diagnostic.systemId ?? diagnostic.gameCode ?? ""} ${diagnostic.romHash ?? diagnostic.gameTitle ?? ""}`.trim();

  const diffed = diffWatchSnapshots(previousWatches, diagnostic.watches ?? []);
  const labels = loadCandidateLabels();

  for (const watch of diffed) {
    const typed = decodeTypedValues(watch);
    const row = document.createElement("tr");
    row.appendChild(cell(watch.label));
    row.appendChild(cell(toHexString(watch.address, 4)));
    row.appendChild(cell(typed.u8, watch.changes.u8));
    row.appendChild(cell(typed.s8, watch.changes.u8));
    row.appendChild(cell(typed.u16, watch.changes.u16));
    row.appendChild(cell(typed.s16, watch.changes.u16));
    row.appendChild(cell(typed.u32, watch.changes.u32));
    row.appendChild(cell(typed.s32, watch.changes.u32));

    const labelCell = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "candidate name";
    input.value = labels[watch.label] ?? "";
    input.addEventListener("change", () => saveCandidateLabel(watch.label, input.value.trim()));
    labelCell.appendChild(input);
    row.appendChild(labelCell);

    tbody.appendChild(row);
  }

  previousWatches = diagnostic.watches ?? [];

  const scanOutput = document.getElementById("scan-output");
  scanOutput.textContent = diagnostic.scan
    ? `start=${toHexString(diagnostic.scan.start, 4)} length=${diagnostic.scan.length}\n${diagnostic.scan.bytesHex}`
    : "No scan configured (see --scan-start/--scan-length on the launcher).";
}

async function refresh() {
  const status = document.getElementById("status");
  status.textContent = `Refreshing at ${new Date().toLocaleTimeString()}...`;
  try {
    const [watches, source, state] = await Promise.all([
      fetchJson("/api/watches"),
      fetchJson("/api/source"),
      fetchJson("/api/state"),
    ]);
    renderWatches(watches);
    document.getElementById("source-output").textContent = source
      ? JSON.stringify(source, null, 2)
      : "Not available (production connector not running or has not written a snapshot yet).";
    document.getElementById("state-output").textContent = state
      ? JSON.stringify(state, null, 2)
      : "Not available (npm run live:emerald is not running or has not written state yet).";
    status.textContent = `Last refresh: ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    status.textContent = `Refresh failed: ${error.message}`;
  }
}

function setAutoRefresh(enabled) {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  if (enabled) {
    autoRefreshTimer = setInterval(refresh, 1000);
  }
}

document.getElementById("refresh-now").addEventListener("click", refresh);
document.getElementById("auto-refresh").addEventListener("change", (event) => setAutoRefresh(event.target.checked));

setAutoRefresh(document.getElementById("auto-refresh").checked);
refresh();
