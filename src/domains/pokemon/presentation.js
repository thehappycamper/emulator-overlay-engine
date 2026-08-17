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
  // `activePlayerIndex` is a pre-existing placeholder from the mapping layer
  // (always 0 until real active-battler-slot decoding exists - see
  // docs/tasks/P05/P05-T010.md). It is reused here, not newly invented, and
  // disclosed to the viewer rather than silently presented as certain.
  const activePlayerIndex = Number.isInteger(state.battle?.activePlayerIndex) ? state.battle.activePlayerIndex : 0;
  const activePlayer = party[activePlayerIndex] ?? null;
  // Requires an explicit `false`, not just "not true" - an unknown/absent
  // trainerBattle value must never be treated as "known wild", since
  // showing ball-throw odds during an actual trainer battle would be
  // actively misleading (balls cannot be thrown there at all).
  const isWildBattle = Boolean(opponent) && state.battle?.trainerBattle === false;
  const balls = state.bag?.balls ?? null;
  const playerStatStages = state.battle?.player?.statStages ?? null;

  return `
    <header class="topbar">
      <div>
        <h1>${escapeHtml(state.game?.title)}</h1>
        <p>${escapeHtml(state.game?.adapter)} &middot; Gen ${escapeHtml(state.game?.generation)} &middot; ${escapeHtml(state.location?.name ?? "Unknown location")}</p>
      </div>
      ${renderBadges(badges)}
    </header>

    ${renderEncounters(state.location?.encounters ?? null)}

    <main class="dashboard">
      <section class="team-section">
        <h2>Team</h2>
        <div class="team-grid">
          ${Array.from({ length: 6 }, (_, index) => renderTeamSlot(party[index], index)).join("")}
        </div>
      </section>

      <section class="battle-section">
        <h2>Battle</h2>
        ${opponent ? renderBattle(opponent, incoming, activePlayer, activePlayerIndex, playerStatStages) : '<p class="subtle empty-battle">Not currently in battle.</p>'}
        ${isWildBattle ? renderBallsPanel(balls) : ""}
      </section>
    </main>
  `;
}

// Collapsed by default, same rationale as the stat/ball panels below: useful
// reference, not something that should permanently consume dashboard space.
// `encounters` comes straight from the acquisition layer's wild-encounter
// lookup (pret/pokeemerald's own data) - never fabricated for locations
// with no standard wild encounters (towns, buildings), which render a
// clear "no wild encounters" message instead of an empty table.
function renderEncounters(encounters) {
  if (!Array.isArray(encounters) || encounters.length === 0) {
    return `
      <details class="encounters-panel">
        <summary>Wild Encounters Here</summary>
        <p class="subtle">No wild encounters at this location.</p>
      </details>
    `;
  }

  const rows = encounters
    .map((encounter) => `
      <tr>
        <td>${escapeHtml(encounter.name ?? `Species #${encounter.speciesId}`)}</td>
        <td class="subtle">${escapeHtml(encounter.method)}</td>
        <td class="subtle">Lv ${escapeHtml(encounter.minLevel)}${encounter.maxLevel !== encounter.minLevel ? `&ndash;${escapeHtml(encounter.maxLevel)}` : ""}</td>
        <td class="subtle">${(encounter.rate * 100).toFixed(1)}%</td>
      </tr>
    `)
    .join("");

  return `
    <details class="encounters-panel">
      <summary>Wild Encounters Here (${encounters.length})</summary>
      <table class="encounters-table">
        <tbody>${rows}</tbody>
      </table>
    </details>
  `;
}

// Only rendered during an active wild (non-trainer) battle - ball-throwing
// has no meaning in a trainer battle. `catchChance` is a pre-computed
// number (or null) from the acquisition layer; this function only formats
// it, it does not compute Emerald's catch formula itself - see
// docs/tasks/P05/P05-T011.md's architecture notes on why that boundary
// matters.
function renderBallsPanel(balls) {
  if (!Array.isArray(balls) || balls.length === 0) {
    return `
      <details class="balls-panel">
        <summary>Poke Balls</summary>
        <p class="subtle">No Poke Balls in the bag.</p>
      </details>
    `;
  }

  const rows = balls
    .map((ball) => `
      <tr>
        <td>${escapeHtml(ball.name ?? `Item #${ball.id}`)}</td>
        <td class="subtle">&times;${escapeHtml(ball.quantity)}</td>
        <td class="ball-chance">${typeof ball.catchChance === "number" ? `${(ball.catchChance * 100).toFixed(1)}%` : "unavailable"}</td>
      </tr>
    `)
    .join("");

  return `
    <details class="balls-panel">
      <summary>Poke Balls</summary>
      <table class="balls-table">
        <thead><tr><th></th><th></th><th>Catch Odds</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>
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

function renderBattle(opponent, incoming, activePlayer, activePlayerIndex, playerStatStages) {
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
    ${renderStatComparison(activePlayer, activePlayerIndex, opponent, playerStatStages)}
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

// Stat rows shown in the comparison panel. `value` reads the numeric stat
// used both for display and for the relative indicator; HP is handled
// separately below because it is shown as "current/max" text rather than a
// single number.
const STAT_COMPARISON_ROWS = Object.freeze([
  { label: "Level", value: (pokemon) => (Number.isInteger(pokemon?.level) ? pokemon.level : null) },
  { label: "Attack", value: (pokemon) => pokemon?.stats?.atk ?? null, stageKey: "atk" },
  { label: "Defense", value: (pokemon) => pokemon?.stats?.def ?? null, stageKey: "def" },
  { label: "Sp. Atk", value: (pokemon) => pokemon?.stats?.spa ?? null, stageKey: "spa" },
  { label: "Sp. Def", value: (pokemon) => pokemon?.stats?.spd ?? null, stageKey: "spd" },
  { label: "Speed", value: (pokemon) => pokemon?.stats?.spe ?? null, stageKey: "spe" },
]);

// Accuracy/Evasion have no underlying numeric base stat (they exist only as
// battle stat stages - see NUM_BATTLE_STATS in emerald-us-rev0.js's `battle`
// constant block), so unlike the rows above there is never a raw value to
// compare or show a </>/= indicator for; only the stage badge itself is
// meaningful. Still rendered through the same row/table shape so a boost or
// drop is exactly as visible as it is for Attack/Defense/etc.
const STAT_STAGE_ONLY_ROWS = Object.freeze([
  { label: "Accuracy", stageKey: "acc" },
  { label: "Evasion", stageKey: "eva" },
]);

function statComparisonIndicator(playerValue, opponentValue) {
  if (typeof playerValue !== "number" || typeof opponentValue !== "number") {
    return { symbol: "&ndash;", class: "stat-unknown" };
  }
  if (playerValue > opponentValue) return { symbol: "&gt;", class: "stat-advantage" };
  if (playerValue < opponentValue) return { symbol: "&lt;", class: "stat-disadvantage" };
  return { symbol: "=", class: "stat-even" };
}

// Renders a live battle stat-stage modifier as "(+1)"/"(-2)"/"(+0)", or an
// empty string when the stage genuinely was not acquired (outside battle,
// or gBattleMons was unreadable) - unavailable stage data must never be
// shown as "(+0)", since that would misreport an unknown modifier as
// confirmed-neutral.
function formatStatStage(stage) {
  if (!Number.isInteger(stage)) return "";
  const sign = stage > 0 ? "+" : stage < 0 ? "" : "+";
  const stageClass = stage > 0 ? "stage-up" : stage < 0 ? "stage-down" : "stage-neutral";
  return ` <span class="stat-stage ${stageClass}">(${sign}${stage})</span>`;
}

function renderStatComparisonRow(label, playerValue, opponentValue, { playerText, opponentText, playerStage, opponentStage } = {}) {
  const indicator = statComparisonIndicator(playerValue, opponentValue);
  const playerDisplay = playerText ?? (typeof playerValue === "number" ? String(playerValue) : "&ndash;");
  const opponentDisplay = opponentText ?? (typeof opponentValue === "number" ? String(opponentValue) : "&ndash;");
  return `
    <tr>
      <th scope="row">${escapeHtml(label)}</th>
      <td class="stat-value ${indicator.class === "stat-advantage" ? "stat-highlight" : ""}">${playerDisplay}${formatStatStage(playerStage)}</td>
      <td class="stat-indicator ${indicator.class}">${indicator.symbol}</td>
      <td class="stat-value ${indicator.class === "stat-disadvantage" ? "stat-highlight" : ""}">${opponentDisplay}${formatStatStage(opponentStage)}</td>
    </tr>
  `;
}

// Collapsed by default (native <details>, no client-side script required)
// so the comparison is available without permanently consuming dashboard
// space. `activePlayer` comes from `battle.activePlayerIndex`, a
// pre-existing mapping placeholder (always party slot 0 today) rather than
// verified active-battler tracking - see docs/tasks/P05/P05-T010.md for why
// that remains a follow-up rather than a guess at a new fixed memory
// address this task cannot verify in this environment.
function renderStatComparison(activePlayer, activePlayerIndex, opponent, playerStatStages) {
  if (!activePlayer) {
    return `
      <details class="stat-compare">
        <summary>Compare Stats</summary>
        <p class="subtle stat-compare-note">No battle-ready party member available to compare.</p>
      </details>
    `;
  }

  const rows = STAT_COMPARISON_ROWS.map((row) =>
    renderStatComparisonRow(row.label, row.value(activePlayer), row.value(opponent), {
      playerStage: row.stageKey ? playerStatStages?.[row.stageKey] ?? null : null,
      opponentStage: row.stageKey ? opponent?.statStages?.[row.stageKey] ?? null : null,
    }),
  ).join("");
  const stageOnlyRows = STAT_STAGE_ONLY_ROWS.map((row) =>
    renderStatComparisonRow(row.label, null, null, {
      playerStage: playerStatStages?.[row.stageKey] ?? null,
      opponentStage: opponent?.statStages?.[row.stageKey] ?? null,
    }),
  ).join("");
  const hpRow = renderStatComparisonRow(
    "HP",
    activePlayer.currentHp,
    opponent.currentHp,
    {
      playerText: Number.isInteger(activePlayer.currentHp) && Number.isInteger(activePlayer.maxHp) ? `${activePlayer.currentHp}/${activePlayer.maxHp}` : "&ndash;",
      opponentText: Number.isInteger(opponent.currentHp) && Number.isInteger(opponent.maxHp) ? `${opponent.currentHp}/${opponent.maxHp}` : "&ndash;",
    },
  );

  return `
    <details class="stat-compare">
      <summary>Compare Stats</summary>
      <p class="subtle stat-compare-note">Your Pokemon (party slot ${activePlayerIndex + 1})${activePlayerIndex === 0 ? " - active-battler tracking is not yet implemented, so this always shows slot 1" : ""} vs. ${escapeHtml(opponent.nickname || opponent.name || "the opponent")}.</p>
      <table class="stat-compare-table">
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">${escapeHtml(activePlayer.nickname || activePlayer.name || "Yours")}</th>
            <th scope="col"></th>
            <th scope="col">${escapeHtml(opponent.nickname || opponent.name || "Opponent")}</th>
          </tr>
        </thead>
        <tbody>
          ${hpRow}
          ${rows}
          ${stageOnlyRows}
        </tbody>
      </table>
    </details>
  `;
}
