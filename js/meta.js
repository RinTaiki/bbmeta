import { fetchMetaDecks } from "./api.js";
import { showNotification } from "./notifications.js";


let currentFilter = { minTrophies: null, maxTrophies: null };
let currentSort = "winRate";
let allDecks = [];

document.addEventListener("DOMContentLoaded", () => {
  initMetaPage();
});

function initMetaPage() {
  const trophyFilter = document.getElementById("trophy-filter");
  const sortSelect = document.getElementById("sort-select");
  const retryBtn = document.getElementById("retry-btn");


  if (trophyFilter) {
    trophyFilter.addEventListener("click", (e) => {
      const chip = e.target.closest(".filter-chip");
      if (!chip) return;

      trophyFilter
        .querySelectorAll(".filter-chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");

      currentFilter = {
        minTrophies: chip.dataset.min ? Number(chip.dataset.min) : null,
        maxTrophies: chip.dataset.max ? Number(chip.dataset.max) : null,
      };

      loadDecks();
    });
  }


  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      currentSort = e.target.value;
      renderDecks();
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener("click", loadDecks);
  }

  loadDecks();
}

async function loadDecks() {
  showState("loading");

  try {
    showNotification("Fetching meta decks...", "info");
    const data = await fetchMetaDecks(7, 100, currentFilter);
    const items = Array.isArray(data) ? data : data?.items || [];

    allDecks = items;
    renderDecks();
    showNotification("Meta decks updated", "success");
  } catch (error) {
    console.error("Meta decks load error:", error);
    showState("error");
    showNotification("Failed to load meta decks.", "error");
  }
}

function renderDecks() {
  const grid = document.getElementById("decks-grid");
  if (!grid) return;

  if (allDecks.length === 0) {
    showState("empty");
    return;
  }

  showState("grid");

  
  const sorted = [...allDecks].sort(
    (a, b) => (b[currentSort] || 0) - (a[currentSort] || 0),
  );

  grid.innerHTML = "";

  sorted.forEach((deck, index) => {
    const card = document.createElement("div");
    card.className = "deck-card";

    const winRate = ((deck.winRate || 0) * 100).toFixed(1);
    const usage = ((deck.usageRate || 0) * 100).toFixed(2);
    const sampleSize = deck.sampleSize || 0;

    const clonesHTML = (deck.units || [])
      .slice(0, 8)
      .map((unit) => {
        const name = unit.displayName || unit.name || "Clone";
        const iconSrc = cloneIconPath(name);
        return `
          <div class="clone-icon" title="${escapeHTML(name)}">
            <img src="${iconSrc}" alt="${escapeHTML(name)}" loading="lazy"
                 onerror="this.src='assets/clones/plainbomb.png'" />
          </div>
        `;
      })
      .join("");

    card.innerHTML = `
      <div class="deck-rank">#${index + 1}</div>
      <div class="deck-clones">${clonesHTML}</div>
      <div class="deck-stats">
        <div class="deck-stat">
          <span class="deck-stat-label">Win Rate</span>
          <span class="deck-stat-value win">${winRate}%</span>
        </div>
        <div class="deck-stat">
          <span class="deck-stat-label">Usage</span>
          <span class="deck-stat-value">${usage}%</span>
        </div>
        <div class="deck-stat">
          <span class="deck-stat-label">Samples</span>
          <span class="deck-stat-value">${sampleSize.toLocaleString()}</span>
        </div>
      </div>
      <div class="winrate-track">
        <span class="winrate-fill" style="width:${winRate}%"></span>
      </div>
    `;

    grid.appendChild(card);
  });
}


function cloneIconPath(displayName) {
  const file = displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `assets/clones/${file}.png`;
}

function showState(state) {
  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("error-state");
  const emptyState = document.getElementById("empty-state");
  const grid = document.getElementById("decks-grid");

  loadingState.classList.add("hidden");
  errorState.classList.add("hidden");
  emptyState.classList.add("hidden");

  if (state === "loading") {
    loadingState.classList.remove("hidden");
    grid.style.opacity = "0.3";
  } else if (state === "error") {
    errorState.classList.remove("hidden");
    grid.style.opacity = "0";
  } else if (state === "empty") {
    emptyState.classList.remove("hidden");
    grid.style.opacity = "1";
  } else if (state === "grid") {
    grid.style.opacity = "1";
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
