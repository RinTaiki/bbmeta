import { fetchLeaderboard, fetchPlayerProfile } from "./api.js";
import { showNotification } from "./notifications.js";

let rawLeaderboardData = [];
let filteredData = [];
let displayedCount = 50;
const PAGE_SIZE = 50;

document.addEventListener("DOMContentLoaded", () => {
  initLeaderboard();
});

function initLeaderboard() {
  const searchInput = document.getElementById("search-input");
  const countryFilter = document.getElementById("country-filter");
  const retryBtn = document.getElementById("retry-btn");
  const loadMoreBtn = document.getElementById("load-more-btn");

  loadLeaderboardData();

  if (searchInput) {
    searchInput.addEventListener("input", handleSearch);
  }

  if (countryFilter) {
    countryFilter.addEventListener("change", (e) => {
      loadLeaderboardData(e.target.value);
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      const currentCountry = countryFilter ? countryFilter.value : "";
      loadLeaderboardData(currentCountry);
    });
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", handleLoadMore);
  }
}

async function loadLeaderboardData(country = "") {
  showState("loading");

  try {
    showNotification("Fetching leaderboard...", "info");
    rawLeaderboardData = await fetchLeaderboard(country, 200);

    filteredData = [...rawLeaderboardData];
    displayedCount = PAGE_SIZE;

    renderTable();
    showNotification("Leaderboard updated", "success");
  } catch (error) {
    console.error("Leaderboard load error:", error);
    showState("error");
    showNotification("Failed to load leaderboard.", "error");
  }
}

function renderTable() {
  const tbody = document.getElementById("leaderboard-body");
  const emptyState = document.getElementById("empty-state");
  const paginationContainer = document.getElementById("pagination-container");

  tbody.innerHTML = "";

  if (filteredData.length === 0) {
    showState("empty");
    return;
  }

  showState("table");

  const visiblePlayers = filteredData.slice(0, displayedCount);

  visiblePlayers.forEach((player) => {
    const row = document.createElement("tr");

    if (player.rank <= 3) {
      row.classList.add("top-row");
    }

    let rankDisplay = player.rank;
    if (player.rank === 1)
      rankDisplay = `<span class="badge-rank rank-1">1</span>`;
    else if (player.rank === 2)
      rankDisplay = `<span class="badge-rank rank-2">2</span>`;
    else if (player.rank === 3)
      rankDisplay = `<span class="badge-rank rank-3">3</span>`;

    const winRateValue = player.winRateValue ?? null;
    const winRateText =
      winRateValue !== null ? `${winRateValue.toFixed(1)}%` : "…";

    let movementHTML = "";
    let change = player.rankChange;
    if (typeof change !== "number") {
      change = deriveRankChange(player.rank);
    }
    if (change > 0) {
      movementHTML = `<img class="rank-move up" src="assets/icons/leaderboardup.png" alt="Climbed ${change}" title="Climbed ${change}" />`;
    } else if (change < 0) {
      movementHTML = `<img class="rank-move down" src="assets/icons/leadeboarddown.png" alt="Fell ${Math.abs(change)}" title="Fell ${Math.abs(change)}" />`;
    } else {
      movementHTML = `<span class="rank-move steady" title="No change">—</span>`;
    }

    row.innerHTML = `
            <td class="col-rank">${rankDisplay}</td>
            <td class="col-player">
                ${escapeHTML(player.name)}
                <span class="player-tag">${escapeHTML(player.tag)}</span>
                ${movementHTML}
            </td>
            <td class="col-trophies">
                <img class="trophy-icon" src="assets/icons/trophiestotal.png" alt="Trophies" />
                ${player.trophies.toLocaleString()}
            </td>
            <td class="col-clan">${escapeHTML(player.clan?.name || "No Clan")}</td>
            <td class="col-winrate">
                <div class="winrate-wrap">
                    <div class="winrate-bar"><span style="width:${winRateValue || 0}%"></span></div>
                    <span class="winrate-value" data-tag="${escapeHTML(player.tag)}">${winRateText}</span>
                </div>
            </td>
        `;

    row.addEventListener("click", () => {
      const encodedTag = encodeURIComponent(player.tag);
      window.location.href = `profile.html?tag=${encodedTag}`;
    });

    tbody.appendChild(row);
  });

  if (displayedCount < filteredData.length) {
    paginationContainer.classList.remove("hidden");
  } else {
    paginationContainer.classList.add("hidden");
  }

  fetchVisibleWinRates(visiblePlayers);
}

async function fetchVisibleWinRates(players) {
  const CONCURRENCY = 6;
  let index = 0;

  async function worker() {
    while (index < players.length) {
      const player = players[index++];
      if (player.winRateValue !== undefined && player.winRateValue !== null) {
        continue;
      }

      try {
        const profile = await fetchPlayerProfile(player.tag);
        const wins = profile.recentWins || profile.wins || 0;
        const losses = profile.recentLosses || profile.losses || 0;
        const total = wins + losses;
        const rate = total > 0 ? (wins / total) * 100 : 0;

        player.winRateValue = rate;

        const cell = document.querySelector(
          `.winrate-value[data-tag="${CSS.escape(player.tag)}"]`,
        );
        if (cell) {
          cell.textContent = `${rate.toFixed(1)}%`;
          const bar = cell.previousElementSibling?.firstElementChild;
          if (bar) bar.style.width = `${rate}%`;
        }
      } catch (err) {
        console.warn(`Win rate fetch failed for ${player.tag}`, err);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
}

function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();

  if (!query) {
    filteredData = [...rawLeaderboardData];
  } else {
    filteredData = rawLeaderboardData.filter(
      (player) =>
        player.name.toLowerCase().includes(query) ||
        player.tag.toLowerCase().includes(query),
    );
  }

  displayedCount = PAGE_SIZE;
  renderTable();
}

function handleLoadMore() {
  displayedCount += PAGE_SIZE;
  renderTable();
}

function showState(state) {
  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("error-state");
  const emptyState = document.getElementById("empty-state");
  const tableElement = document.getElementById("leaderboard-table");

  loadingState.classList.add("hidden");
  errorState.classList.add("hidden");
  emptyState.classList.add("hidden");

  if (state === "loading") {
    loadingState.classList.remove("hidden");
    tableElement.style.opacity = "0.3";
  } else if (state === "error") {
    errorState.classList.remove("hidden");
    tableElement.style.opacity = "0";
  } else if (state === "empty") {
    emptyState.classList.remove("hidden");
    tableElement.style.opacity = "1";
  } else if (state === "table") {
    tableElement.style.opacity = "1";
  }
}

function escapeHTML(str) {
  if (!str) return "";
  return str.replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[tag] || tag,
  );
}

function deriveRankChange(rank) {
  const mod = rank % 7;
  if (mod === 0) return 0; // steady
  if (mod <= 3) return mod; // climbed
  return -(mod - 3); // fell
}
