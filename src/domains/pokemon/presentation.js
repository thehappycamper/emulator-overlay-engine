import { projectIncomingDamage } from "./damage.js";

const STATUS_LABEL = Object.freeze({
  none: "",
  asleep: "Asleep",
  poisoned: "Poisoned",
  "badly-poisoned": "Badly Poisoned",
  burned: "Burned",
  frozen: "Frozen",
  paralyzed: "Paralyzed",
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function hpPercent(pokemon) {
  if (!pokemon.maxHp) return 0;
  return Math.max(0, Math.min(100, Math.round((pokemon.currentHp / pokemon.maxHp) * 100)));
}

function hpBarClass(percent) {
  if (percent <= 20) return "hp-low";
  if (percent <= 50) return "hp-mid";
  return "hp-high";
}

export function renderPokemonOverlay(state) {
  const party = state.player?.party ?? [];
  const opponent = state.battle?.opponent ?? null;
  const badges = state.player?.badges ?? null;
  const incoming = opponent ? projectIncomingDamage(opponent, party.filter(Boolean)) : [];

  return `
    <header class="topbar">
      <div>
        <h1>${escapeHtml(state.game?.title)}</h1>
        <p>${escapeHtml(state.game?.adapter)} &middot; Gen ${escapeHtml(state.game?.generation)} &middot; ${escapeHtml(state.location?.name ?? "Unknown location")}</p>
      </div>
      ${renderBadges(badges)}
    </header>

    <main class="dashboard">
      <section class="team-section">
        <h2>Team</h2>
        <div class="team-grid">
          ${Array.from({ length: 6 }, (_, index) => renderTeamSlot(party[index], index)).join("")}
        </div>
      </section>

      <section class="battle-section">
        <h2>Battle</h2>
        ${opponent ? renderBattle(opponent, incoming) : '<p class="subtle empty-battle">Not currently in battle.</p>'}
      </section>
    </main>
  `;
}

function renderBadges(badges) {
  if (!Array.isArray(badges)) {
    return '<div class="badges subtle">Badges: unavailable</div>';
  }
  const earned = badges.filter(Boolean).length;
  const pips = badges.map((earnedFlag, index) => `<span class="badge-pip ${earnedFlag ? "earned" : ""}" title="Badge ${index + 1}"></span>`).join("");
  return `<div class="badges"><span class="subtle">${earned}/8 Badges</span><div class="badge-pips">${pips}</div></div>`;
}

function renderTeamSlot(pokemon, index) {
  if (!pokemon) {
    return `
      <article class="card team-card empty-slot">
        <div class="empty-slot-label">Slot ${index + 1}</div>
        <div class="subtle">No Pokemon</div>
      </article>
    `;
  }

  const percent = hpPercent(pokemon);
  const statusLabel = STATUS_LABEL[pokemon.status] ?? pokemon.status ?? "";
  const types = Array.isArray(pokemon.types) ? pokemon.types : [];
  const moves = Array.isArray(pokemon.moves) ? pokemon.moves : [];
  const genderSymbol = pokemon.gender === "male" ? "&#9794;" : pokemon.gender === "female" ? "&#9792;" : "";

  return `
    <article class="card team-card${pokemon.currentHp === 0 ? " fainted" : ""}">
      <div class="card-title">
        <strong>${escapeHtml(pokemon.nickname || pokemon.name || "Unknown")}</strong>
        <span class="gender-symbol">${genderSymbol}</span>
        <span class="level">Lv ${escapeHtml(pokemon.level)}</span>
      </div>
      <div class="subtle species-line">
        ${escapeHtml(pokemon.name ?? "Species unknown")}
        ${types.length ? `<span class="types">${types.map((type) => `<span class="type-badge type-${type.toLowerCase()}">${escapeHtml(type)}</span>`).join("")}</span>` : ""}
      </div>
      <div class="hp-row">
        <div class="hp ${hpBarClass(percent)}"><span style="width:${percent}%"></span></div>
        <span class="hp-text">${pokemon.currentHp}/${pokemon.maxHp}</span>
      </div>
      ${statusLabel ? `<div class="status-badge status-${pokemon.status}">${statusLabel}</div>` : ""}
      ${pokemon.expProgress ? renderExpBar(pokemon.expProgress) : ""}
      ${pokemon.item ? `<div class="subtle item-line">Holding: ${escapeHtml(pokemon.item)}</div>` : ""}
      ${moves.length ? `<ol class="moves">${moves.map(renderMove).join("")}</ol>` : '<p class="subtle">No known moves.</p>'}
      <div class="subtle slot-footer">Slot ${index + 1}</div>
    </article>
  `;
}

function renderExpBar(expProgress) {
  return `
    <div class="exp-row" title="${expProgress.expIntoLevel}/${expProgress.expForNextLevel} EXP to next level">
      <div class="exp-bar"><span style="width:${expProgress.percent}%"></span></div>
    </div>
  `;
}

function renderMove(move) {
  const ppText = Number.isInteger(move.currentPp) ? `${move.currentPp}${Number.isInteger(move.maxPp) ? `/${move.maxPp}` : ""}` : "";
  return `
    <li>
      <span class="move-name">${escapeHtml(move.name ?? `Move #${move.id}`)}</span>
      ${move.type ? `<span class="type-badge type-${move.type.toLowerCase()}">${escapeHtml(move.type)}</span>` : ""}
      <span class="move-pp subtle">${ppText ? `PP ${ppText}` : ""}</span>
    </li>
  `;
}

function renderBattle(opponent, incoming) {
  const percent = hpPercent(opponent);
  const statusLabel = STATUS_LABEL[opponent.status] ?? opponent.status ?? "";
  const types = Array.isArray(opponent.types) ? opponent.types : [];
  const moves = Array.isArray(opponent.moves) ? opponent.moves : [];

  return `
    <article class="card opponent-card">
      <div class="card-title">
        <strong>${escapeHtml(opponent.nickname || opponent.name || "Unknown")}</strong>
        <span class="level">Lv ${escapeHtml(opponent.level)}</span>
      </div>
      <div class="subtle species-line">
        ${escapeHtml(opponent.name ?? "Species unknown")}
        ${types.length ? `<span class="types">${types.map((type) => `<span class="type-badge type-${type.toLowerCase()}">${escapeHtml(type)}</span>`).join("")}</span>` : ""}
      </div>
      <div class="hp-row">
        <div class="hp ${hpBarClass(percent)}"><span style="width:${percent}%"></span></div>
        <span class="hp-text">${opponent.currentHp}/${opponent.maxHp}</span>
      </div>
      ${statusLabel ? `<div class="status-badge status-${opponent.status}">${statusLabel}</div>` : ""}
      ${moves.length ? `<ol class="moves">${moves.map(renderMove).join("")}</ol>` : '<p class="subtle">No observed moves.</p>'}
    </article>
    <div class="incoming-damage">
      <h3>Projected Incoming Damage</h3>
      <div class="damage-list">
        ${incoming.map((projection) => `
          <div>
            <strong>${escapeHtml(projection.target)}</strong>
            <span>${projection.worstCase ? `${escapeHtml(projection.worstCase.move)}: ${projection.worstCase.minPercent}-${projection.worstCase.maxPercent}%` : "No damaging moves observed"}</span>
          </div>
        `).join("") || '<p class="subtle">No party data to project against.</p>'}
      </div>
    </div>
  `;
}
