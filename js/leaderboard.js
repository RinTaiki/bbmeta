import { fetchLeaderboard, fetchPlayerProfile } from "./api.js";
import { CLONE_META } from "./clone-meta.js";
import { showNotification } from "./notifications.js";

let rawLeaderboardData = [];
let filteredData = [];
let rankChanges = {};
let displayedCount = 50;
let leaderboardRequestId = 0;
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
  const requestId = ++leaderboardRequestId;

  try {
    showNotification("Fetching leaderboard...", "info");
    const [leaderboardData, changes] = await Promise.all([
      fetchLeaderboard(country, 200),
      fetchRankChanges(),
    ]);

    if (requestId !== leaderboardRequestId) {
      return;
    }

    pendingWinRateFetches.clear();
    rawLeaderboardData = leaderboardData;
    rankChanges = changes;

    filteredData = [...rawLeaderboardData];
    displayedCount = PAGE_SIZE;

    renderTable();
    showNotification("Leaderboard updated", "success");
  } catch (error) {
    if (requestId !== leaderboardRequestId) {
      return;
    }

    console.error("Leaderboard load error:", error);
    showState("error");
    showNotification("Failed to load leaderboard.", "error");
  }
}

async function fetchRankChanges() {
  try {
    const base =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
        ? "https://bbmeta.vercel.app"
        : "";
    const response = await fetch(`${base}/api/rank-changes`);
    if (!response.ok) {
      throw new Error(`Rank changes request failed: ${response.status}`);
    }
    const data = await response.json();
    return data.changes || {};
  } catch (error) {
    console.warn("Rank changes unavailable:", error);
    return {};
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
  const fragment = document.createDocumentFragment();

  visiblePlayers.forEach((player) => {
    const row = document.createElement("tr");
    row.setAttribute("role", "link");
    row.setAttribute("tabindex", "0");

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
    const wrClass =
      winRateValue === null ? "" : winRateValue >= 50 ? "is-good" : "is-bad";

    const change = rankChanges[player.tag];
    let movementHTML = "";

    if (change !== null && change !== undefined) {
      if (change > 0) {
        movementHTML = `<span class="rank-change up" title="Climbed ${change}">▲ ${change}</span>`;
      } else if (change < 0) {
        movementHTML = `<span class="rank-change down" title="Fell ${Math.abs(change)}">▼ ${Math.abs(change)}</span>`;
      } else {
        movementHTML = `<span class="rank-change even" title="No change">—</span>`;
      }
    }

    const tagHTML = escapeHTML(player.tag);
    const clanRaw = player.clan;
    const clanName =
      typeof clanRaw === "string" ? clanRaw : clanRaw?.name || "No Clan";

    row.innerHTML = `
            <td class="col-rank">${rankDisplay}</td>
            <td class="col-player">
                ${escapeHTML(player.name)}
                <span class="player-tag-wrap">
                  <span class="player-tag">${tagHTML}</span>
                  <button class="copy-tag-btn" title="Copy tag" data-tag="${tagHTML}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  </button>
                </span>
                ${movementHTML}
            </td>
            <td class="col-trophies">
                <img class="trophy-icon" src="assets/icons/trophiestotal.png" alt="Trophies" />
                ${player.trophies.toLocaleString()}
            </td>
            <td class="col-clan">${escapeHTML(clanName)}</td>
            <td class="col-deck">
                <div class="deck-cell" data-tag="${tagHTML}" title="Main deck loading…">
                    <span class="deck-loading">…</span>
                </div>
            </td>
            <td class="col-winrate">
                <div class="winrate-wrap">
                    <div class="winrate-bar"><span class="${wrClass}" style="width:${winRateValue || 0}%"></span></div>
                    <span class="winrate-value ${wrClass}" data-tag="${tagHTML}">${winRateText}</span>
                </div>
            </td>
        `;

    const copyBtn = row.querySelector(".copy-tag-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleCopyTag(copyBtn, player.tag);
      });
    }

    row.addEventListener("click", () => {
      const encodedTag = encodeURIComponent(player.tag);
      window.location.href = `profile.html?tag=${encodedTag}`;
    });

    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.href = `profile.html?tag=${encodeURIComponent(player.tag)}`;
      }
    });

    fragment.appendChild(row);
  });

  tbody.appendChild(fragment);

  visiblePlayers.forEach((player) => {
    if (
      player.deckLoaded &&
      Array.isArray(player.deck) &&
      player.deck.length > 0
    ) {
      updateDeckCell(player.tag, player.deck);
    } else if (player.deckLoaded === false) {
      updateDeckUnavailable(player.tag);
    }
  });

  if (displayedCount < filteredData.length) {
    paginationContainer.classList.remove("hidden");
  } else {
    paginationContainer.classList.add("hidden");
  }

  fetchVisibleWinRates(visiblePlayers);
}

// ── Copy Tag helper ───────────────────────────────────────────
function handleCopyTag(btn, tag) {
  const copyIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
  const checkIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  const doCopy = navigator.clipboard
    ? navigator.clipboard
        .writeText(tag)
        .then(() => true)
        .catch(() => fallbackCopy(tag))
    : Promise.resolve(fallbackCopy(tag));

  doCopy.then(() => {
    btn.classList.add("copied");
    btn.innerHTML = checkIcon;
    showNotification(`Copied ${tag} to clipboard`, "success", 2000);
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML = copyIcon;
    }, 1800);
  });
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {}
  document.body.removeChild(ta);
}

// Track tags currently being fetched to prevent duplicate requests
const pendingWinRateFetches = new Set();

async function fetchVisibleWinRates(players) {
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 120;
  const MAX_RETRIES = 1;
  const RETRY_BASE_DELAY_MS = 350;

  // Only queue players that don't already have a win rate and aren't pending
  const queue = players.filter(
    (p) =>
      (p.winRateValue == null || p.deckLoaded !== true) &&
      !pendingWinRateFetches.has(p.tag),
  );
  if (queue.length === 0) return;

  // Mark all as pending before starting
  queue.forEach((p) => pendingWinRateFetches.add(p.tag));

  async function fetchWithRetry(player) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const profile = await fetchPlayerProfile(player.tag);

        // Check if the API returned an error object
        if (profile?.error || profile?.detail) {
          throw new Error(profile.detail || profile.error);
        }

        const wins = profile.recentWins ?? profile.wins ?? 0;
        const losses = profile.recentLosses ?? profile.losses ?? 0;
        const total = wins + losses;
        const rate = total > 0 ? (wins / total) * 100 : 0;

        // currentDeck travels with the same profile response — zero extra cost
        const deck = Array.isArray(profile.currentDeck)
          ? profile.currentDeck
          : null;

        return { rate, deck };
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
          await sleep(delay);
        }
      }
    }
    return null;
  }

  // Process in controlled batches
  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async (player) => {
        const result = await fetchWithRetry(player);
        pendingWinRateFetches.delete(player.tag);

        if (result) {
          player.winRateValue = result.rate;
          player.deck = Array.isArray(result.deck) ? result.deck : null;
          player.deckLoaded =
            Array.isArray(result.deck) && result.deck.length > 0;

          updateWinRateCell(player.tag, result.rate);
          if (player.deckLoaded) {
            updateDeckCell(player.tag, player.deck);
          } else {
            updateDeckUnavailable(player.tag);
          }
        } else {
          player.deck = null;
          player.deckLoaded = false;
          updateDeckUnavailable(player.tag);
        }
      }),
    );

    // Delay between batches to stay under the rate limit
    if (i + BATCH_SIZE < queue.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function updateWinRateCell(tag, rate) {
  const cell = document.querySelector(
    `.winrate-value[data-tag="${CSS.escape(tag)}"]`,
  );
  if (cell) {
    cell.textContent = `${rate.toFixed(1)}%`;
    const wrClass = rate >= 50 ? "is-good" : "is-bad";
    cell.classList.remove("is-good", "is-bad");
    cell.classList.add(wrClass);
    const bar = cell.previousElementSibling?.firstElementChild;
    if (bar) {
      bar.style.width = `${rate}%`;
      bar.classList.remove("is-good", "is-bad");
      bar.classList.add(wrClass);
    }
  }
}

/* ── Main Deck mini-icons (populated from the player profile's
      currentDeck — same API response as the win rate above) ─── */
function updateDeckCell(tag, deck) {
  const cell = document.querySelector(
    `.deck-cell[data-tag="${CSS.escape(tag)}"]`,
  );
  if (!cell) return;

  cell.innerHTML = "";

  const names = [];
  deck.forEach((unit, i) => {
    if (i >= MAX_DECK_ICONS) return;
    const { file, label } = resolveCloneByUnit(unit);
    names.push(label);

    const slot = document.createElement("span");
    slot.className = "deck-icon";
    slot.title = label;

    const img = document.createElement("img");
    img.src = file;
    img.alt = label;
    img.loading = "lazy";
    img.onerror = () => {
      slot.classList.add("is-fallback");
      slot.dataset.fallback = (label || "?").charAt(0).toUpperCase();
      img.remove();
    };

    slot.appendChild(img);
    cell.appendChild(slot);
  });

  if (deck.length > MAX_DECK_ICONS) {
    const more = document.createElement("span");
    more.className = "deck-more";
    more.textContent = `+${deck.length - MAX_DECK_ICONS}`;
    more.title = `${deck.length - MAX_DECK_ICONS} more clones`;
    cell.appendChild(more);
  }

  cell.title = `Main deck: ${names.join(", ")}`;
}

function updateDeckUnavailable(tag) {
  const cell = document.querySelector(
    `.deck-cell[data-tag="${CSS.escape(tag)}"]`,
  );
  if (!cell) return;
  cell.innerHTML = "";
  const dash = document.createElement("span");
  dash.className = "deck-unavailable";
  dash.textContent = "—";
  dash.title = "No deck data";
  cell.appendChild(dash);
}

const MAX_DECK_ICONS = 4;

function cloneKeyForName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function resolveCloneMeta(cardName) {
  const key = cloneKeyForName(cardName);
  return (
    Object.values(CLONE_META).find(
      (m) => m.file && cloneKeyForName(m.file.replace(/\.png$/, "")) === key,
    ) || null
  );
}
function resolveCloneByUnit(unit) {
  // Prefer the numeric unit id — it maps directly to CLONE_META keys
  if (unit && unit.id != null && CLONE_META[unit.id]) {
    const meta = CLONE_META[unit.id];
    return {
      file: `assets/clones/${meta.file}`,
      label: unit.displayName || unit.name || meta.file.replace(/\.png$/, ""),
    };
  }
  const meta = resolveCloneMeta(unit?.name);
  if (meta?.file) {
    return {
      file: `assets/clones/${meta.file}`,
      label: unit?.displayName || unit?.name || meta.file.replace(/\.png$/, ""),
    };
  }
  const fallbackName = unit?.displayName || unit?.name || "Clone";
  return {
    file: `assets/clones/${cloneKeyForName(fallbackName)}.png`,
    label: fallbackName,
  };
}

function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();

  pendingWinRateFetches.clear();

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
