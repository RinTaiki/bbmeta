import {
  fetchPlayerProfile,
  fetchBattleHistory,
  fetchTrophyHistory,
  fetchLeaderboard,
} from "./api.js";
import { showNotification } from "./notifications.js";

let trophyChartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const tag = urlParams.get("tag");

  if (!tag) {
    window.location.href = "index.html";
    return;
  }

  initProfilePage(tag);
});

async function initProfilePage(tag) {
  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("error-state");
  const profileContent = document.getElementById("profile-content");

  showNotification("Loading profile...", "info");

  try {
    const profile = await fetchPlayerProfile(tag);
    renderProfile(profile);

    loadingState.classList.add("hidden");
    profileContent.classList.remove("hidden");
    showNotification("Player found!", "success");
  } catch (err) {
    loadingState.classList.add("hidden");
    errorState.classList.remove("hidden");

    if (err.message === "RATE_LIMIT") {
      showNotification(
        "Rate limit exceeded. Try again in a moment.",
        "warning",
      );
    } else {
      showNotification("Player not found", "error");
    }
    return;
  }

  loadBattleHistory(tag);

  loadTrophyChart(tag);

  loadGlobalRank(tag);
}

async function loadGlobalRank(tag) {
  const rankEl = document.getElementById("stat-rank");
  if (!rankEl) return;

  try {
    const leaderboard = await fetchLeaderboard("", 500);
    const entry = leaderboard.find(
      (p) => p.tag?.toUpperCase() === tag.toUpperCase(),
    );

    if (entry && entry.rank) {
      rankEl.textContent = `#${entry.rank}`;
    } else {
      rankEl.textContent = "Unranked";
    }
  } catch (err) {
    console.warn("Global rank lookup failed", err);
    rankEl.textContent = "Unranked";
  }
}

function renderProfile(data) {
  const avatarEl = document.querySelector(".player-avatar");
  if (avatarEl) {
    avatarEl.innerHTML = `<img src="assets/king/King_01_blue.png" alt="King" />`;
  }

  document.getElementById("player-name").textContent = data.name || "Unknown";
  document.getElementById("player-tag").textContent = data.tag || "";
  document.getElementById("stat-trophies").textContent =
    data.trophies?.toLocaleString() || 0;
  document.getElementById("stat-rank").textContent = data.rank
    ? `#${data.rank}`
    : "Unranked";

  document.getElementById("stat-best-rank").textContent = data.bestSeasonRank
    ? `#${data.bestSeasonRank}`
    : "N/A";

  const wins = data.recentWins || data.wins || 0;
  const losses = data.recentLosses || data.losses || 0;
  const total = wins + losses;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;

  document.getElementById("stat-win-rate").textContent = `${winRate}%`;
  document.getElementById("stat-wl").textContent = `${wins} / ${losses}`;
  document.getElementById("stat-level").textContent =
    data.expLevel || data.level || 1;
  document.getElementById("stat-tribe").textContent = data.clan?.name || "None";

  const copyBtn = document.getElementById("copy-tag-btn");
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(data.tag).then(() => {
      showNotification("Copied to clipboard!", "success");
    });
  });
}

async function loadBattleHistory(tag) {
  const loadingEl = document.getElementById("battles-loading");
  const errorEl = document.getElementById("battles-error");
  const container = document.getElementById("battles-list");

  try {
    const battles = await fetchBattleHistory(tag);
    loadingEl.classList.add("hidden");

    if (!battles || battles.length === 0) {
      errorEl.classList.remove("hidden");
      return;
    }

    battles.forEach((battle) => {
      const card = createBattleCard(battle);
      container.appendChild(card);
    });
  } catch (err) {
    loadingEl.classList.add("hidden");
    errorEl.classList.remove("hidden");
  }
}

function createBattleCard(battle) {
  const card = document.createElement("div");
  card.className = "battle-card";

  const isWin = battle.result === "win";
  const resultClass = isWin ? "win" : "loss";
  const resultEmote = isWin
    ? "assets/emotes/king-celebration.png"
    : "assets/emotes/king-crying.png";
  const resultText = isWin ? "Victory" : "Defeat";
  const relativeTime = getRelativeTime(battle.timestamp);

  const is2v2 = battle.teamSize === 2 || battle.mode === "2v2";
  const modeBadge = is2v2
    ? `<span class="battle-mode mode-2v2">2v2</span>`
    : `<span class="battle-mode mode-1v1">1v1</span>`;

  const deckClones = battle.deck || Array(8).fill("💣");

  card.innerHTML = `
        <div class="battle-header">
            <span class="battle-result ${resultClass}">
                <img src="${resultEmote}" alt="${resultText}" />
                ${resultText}
            </span>
            ${modeBadge}
            <span class="battle-date">${relativeTime}</span>
        </div>
        <div class="battle-opponent">
            <span>vs</span> ${battle.opponent?.name || "Opponent"}
        </div>
        <div class="battle-deck">
            ${deckClones
              .slice(0, 8)
              .map(
                (clone) => `
                <div class="clone-icon" title="${clone.name || "Clone"}">
                    ${clone.icon ? `<img src="${clone.icon}" alt="${clone.name || "Clone"}" />` : "👾"}
                </div>
            `,
              )
              .join("")}
        </div>
    `;

  return card;
}

async function loadTrophyChart(tag) {
  const loadingEl = document.getElementById("chart-loading");
  const errorEl = document.getElementById("chart-error");
  const container = document.getElementById("chart-container");

  try {
    const history = await fetchTrophyHistory(tag);
    loadingEl.classList.add("hidden");

    if (!history || !history.dates || history.dates.length === 0) {
      errorEl.classList.remove("hidden");
      return;
    }

    container.classList.remove("hidden");
    renderChart(history.dates, history.trophies);
  } catch (err) {
    loadingEl.classList.add("hidden");
    errorEl.classList.remove("hidden");
  }
}

function renderChart(dates, trophies) {
  const ctx = document.getElementById("trophyChart").getContext("2d");

  if (trophyChartInstance) {
    trophyChartInstance.destroy();
  }

  trophyChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [
        {
          label: "Trophies",
          data: trophies,
          borderColor: "#c9881f",
          backgroundColor: "rgba(201, 136, 31, 0.12)",
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#2c2114" },
        },
      },
      scales: {
        x: {
          ticks: { color: "#7c6a4f" },
          grid: { color: "rgba(184, 146, 63, 0.15)" },
        },
        y: {
          ticks: { color: "#7c6a4f" },
          grid: { color: "rgba(184, 146, 63, 0.15)" },
        },
      },
    },
  });
}

function getRelativeTime(timestamp) {
  if (!timestamp) return "Recently";
  const elapsed = Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 1000,
  );

  if (elapsed < 60) return "Just now";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h ago`;
  return `${Math.floor(elapsed / 86400)}d ago`;
}
