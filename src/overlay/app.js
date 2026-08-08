import { resolveDomain } from "../domains/index.js";

const { calculateBagBallChances, projectIncomingDamage } = resolveDomain("pokemon").calculators;

const stateUrl = new URLSearchParams(window.location.search).get("state") || "/public/sample-state.json";
const root = document.querySelector("#app");

async function loadState() {
  const response = await fetch(stateUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load ${stateUrl}: ${response.status}`);
  }
  return response.json();
}

function render(state) {
  const opponent = state.battle.opponent;
  const incoming = opponent ? projectIncomingDamage(opponent, state.player.party) : [];
  const catchChances = opponent?.catchRate
    ? calculateBagBallChances({
        pokemon: opponent,
        balls: state.bag.balls || [],
        catchRate: opponent.catchRate,
        status: opponent.status || "none"
      })
    : [];

  root.innerHTML = `
    <header class="topbar">
      <div>
        <h1>${state.game.title}</h1>
        <p>${state.game.adapter} | Gen ${state.game.generation} | ${state.location.name}</p>
      </div>
      <dl class="meters">
        <div><dt>Seed</dt><dd>${state.game.seed ?? "unknown"}</dd></div>
        <div><dt>Frame</dt><dd>${state.game.frame ?? "unknown"}</dd></div>
        <div><dt>Score</dt><dd>${state.score?.current ?? "n/a"}</dd></div>
      </dl>
    </header>

    <main class="layout">
      <section>
        <h2>Party</h2>
        <div class="party">${state.player.party.map(renderPartyCard).join("")}</div>
      </section>

      <section>
        <h2>Opponent</h2>
        ${opponent ? renderOpponent(opponent, incoming, catchChances) : "<p>No opponent detected.</p>"}
      </section>

      <section>
        <h2>Route Encounters</h2>
        <div class="encounters">${(state.location.encounters || []).map(renderEncounter).join("")}</div>
      </section>
    </main>
  `;
}

function renderPartyCard(pokemon, index) {
  const hpPercent = Math.round((pokemon.currentHp / pokemon.maxHp) * 100);
  return `
    <article class="card pokemon-card">
      <div class="card-title">
        <strong>${pokemon.nickname || pokemon.name}</strong>
        <span>Lv ${pokemon.level}</span>
      </div>
      <div class="subtle">${pokemon.name} | ${pokemon.types.join(" / ")}</div>
      <div class="hp"><span style="width:${hpPercent}%"></span></div>
      <div class="stat-grid">
        <span>HP ${pokemon.currentHp}/${pokemon.maxHp}</span>
        <span>Atk ${pokemon.stats.atk}</span>
        <span>Def ${pokemon.stats.def}</span>
        <span>SpA ${pokemon.stats.spa}</span>
        <span>SpD ${pokemon.stats.spd}</span>
        <span>Spe ${pokemon.stats.spe}</span>
      </div>
      <ol class="moves">${pokemon.moves.map((move) => `<li>${move.name}<span>${move.type}</span></li>`).join("")}</ol>
      <div class="subtle">Slot ${index + 1} | PID ${pokemon.pid ?? "unknown"}</div>
    </article>
  `;
}

function renderOpponent(opponent, incoming, catchChances) {
  return `
    <article class="card opponent-card">
      <div class="card-title">
        <strong>${opponent.nickname || opponent.name}</strong>
        <span>Lv ${opponent.level}</span>
      </div>
      <div class="subtle">${opponent.types.join(" / ")} | ${opponent.status || "healthy"} | Catch ${opponent.catchRate ?? "n/a"}</div>
      <h3>Projected Switch Damage</h3>
      <div class="damage-list">
        ${incoming.map((projection) => `
          <div>
            <strong>${projection.target}</strong>
            <span>${projection.worstCase ? `${projection.worstCase.move}: ${projection.worstCase.minPercent}-${projection.worstCase.maxPercent}%` : "No damaging moves"}</span>
          </div>
        `).join("")}
      </div>
      <h3>Catch Odds</h3>
      <div class="damage-list">
        ${catchChances.map((ball) => `
          <div>
            <strong>${ball.name} x${ball.quantity}</strong>
            <span>${ball.chance === null ? "unknown" : `${Math.round(ball.chance * 1000) / 10}%`}</span>
          </div>
        `).join("") || "<p class=\"subtle\">No catch data available.</p>"}
      </div>
    </article>
  `;
}

function renderEncounter(encounter) {
  const width = Math.round(encounter.rate * 100);
  return `
    <div class="encounter-row">
      <div>
        <strong>${encounter.name}</strong>
        <span>${encounter.method} Lv ${encounter.minLevel}-${encounter.maxLevel}</span>
      </div>
      <div class="bar"><span style="width:${width}%"></span></div>
      <b>${width}%</b>
    </div>
  `;
}

loadState()
  .then(render)
  .catch((error) => {
    root.innerHTML = `<pre class="error">${error.message}</pre>`;
  });
