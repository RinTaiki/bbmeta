import { fetchCloneStats } from "./api.js";
import { CLONE_META } from "./clone-meta.js";

const TROPHY_BUCKETS = {
  all: { label: "All", min: null, max: null },
  top: { label: "6,000+", min: 6000, max: null },
  mid: { label: "4,000–5,999", min: 4000, max: 5999 },
  low: { label: "< 4,000", min: null, max: 3999 },
};

let rawCloneData = [];


const trophySelect = document.getElementById("trophy-filter");
const raritySelect = document.getElementById("rarity-filter");
const sortSelect = document.getElementById("sort-filter");
const gridContainer = document.getElementById("clone-grid");
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const emptyState = document.getElementById("empty-state");
const retryBtn = document.getElementById("retry-btn");
const modal = document.getElementById("clone-modal");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");


function normalizePercentage(value) {
  const num = parseFloat(value) || 0;
  return num <= 1 ? num * 100 : num;
}

function getWinRateClass(winRate) {
  if (winRate > 55) return "win-high";
  if (winRate >= 50) return "win-med";
  return "win-low";
}

function formatIconFilename(id, name) {
  const raw = id || name || "unknown";
  return raw.toString().toLowerCase().trim().replace(/\s+/g, "_");
}


function getCloneImage(clone) {
  const meta = CLONE_META[clone.id];
  if (meta && meta.file) return `assets/clones/${meta.file}`;
  return `assets/clones/${formatIconFilename(clone.id, clone.name)}.png`;
}


function getCloneRarity(clone) {
  const meta = CLONE_META[clone.id];
  return (meta && meta.rarity) || "unknown";
}


async function loadData() {
  showState("loading");
  const bucket = TROPHY_BUCKETS[trophySelect.value] || TROPHY_BUCKETS.all;

  try {
    const data = await fetchCloneStats(bucket.min, bucket.max);
    rawCloneData = Array.isArray(data) ? data : data.units || data.data || [];
    processAndRender();
  } catch (err) {
    console.error("Failed to load clone stats:", err);
    showState("error");
  }
}

function showState(state) {
  loadingState.classList.add("hidden");
  errorState.classList.add("hidden");
  emptyState.classList.add("hidden");
  gridContainer.classList.add("hidden");

  if (state === "loading") loadingState.classList.remove("hidden");
  else if (state === "error") errorState.classList.remove("hidden");
  else if (state === "empty") emptyState.classList.remove("hidden");
  else if (state === "grid") gridContainer.classList.remove("hidden");
}


function processAndRender() {
  let processed = rawCloneData.map((item) => {
    const usage = normalizePercentage(item.usageRate ?? item.usage);
    const winRate = normalizePercentage(item.winRate);
    const name = item.displayName || item.name || item.id || "Unknown Clone";
    const id = item.unitId || item.id || name;
    const sampleSize = item.sampleSize || item.matches || 0;
    const rarity = getCloneRarity({ id, name }).toLowerCase();

    return { ...item, id, name, usage, winRate, sampleSize, rarity };
  });


  const selectedRarity = raritySelect.value.toLowerCase();
  if (selectedRarity !== "all") {
    processed = processed.filter((item) => item.rarity === selectedRarity);
  }

  if (processed.length === 0) {
    showState("empty");
    return;
  }


  const sortVal = sortSelect.value;
  processed.sort((a, b) => {
    if (sortVal === "winRate") return b.winRate - a.winRate;
    if (sortVal === "name") return a.name.localeCompare(b.name);
    if (sortVal === "sampleSize") return b.sampleSize - a.sampleSize;
    return b.usage - a.usage; // Default: usage
  });

  renderGrid(processed);
  showState("grid");
}

function renderGrid(clones) {
  gridContainer.innerHTML = "";

  clones.forEach((clone) => {
    const winRateClass = getWinRateClass(clone.winRate);
    const imgSrc = getCloneImage(clone);
    const rarity = clone.rarity || "unknown";

    const card = document.createElement("div");
    card.className = "clone-card";
    card.innerHTML = `
            <div class="card-header">
                <div class="clone-avatar-container">
                    <img class="clone-icon" src="${imgSrc}" alt="${clone.name}" />
                </div>
                <div class="clone-info">
                    <span class="clone-name">${clone.name}</span>
                    <span class="clone-sample">${clone.sampleSize.toLocaleString()} matches</span>
                </div>
            </div>

            <div class="metric-row">
                <div class="metric-labels">
                    <span>Usage</span>
                    <span>${clone.usage.toFixed(1)}%</span>
                </div>
                <div class="metric-bar-bg">
                    <div class="metric-bar-fill usage-fill" style="width: ${Math.min(clone.usage, 100)}%;"></div>
                </div>
            </div>

            <div class="metric-row">
                <div class="metric-labels">
                    <span>Win Rate</span>
                    <span class="${winRateClass}">${clone.winRate.toFixed(1)}%</span>
                </div>
                <div class="metric-bar-bg">
                    <div class="metric-bar-fill ${winRateClass}-fill" style="width: ${Math.min(clone.winRate, 100)}%;"></div>
                </div>
            </div>
        `;


    const img = card.querySelector(".clone-icon");
    img.onerror = () => {
      const initial = clone.name.charAt(0).toUpperCase();
      img.replaceWith(
        Object.assign(document.createElement("div"), {
          className: "clone-icon-placeholder",
          textContent: initial,
        }),
      );
    };


    card.addEventListener("click", () => openSpotlightModal(clone));
    gridContainer.appendChild(card);
  });
}

function openSpotlightModal(clone) {
  const winRateClass = getWinRateClass(clone.winRate);
  const imgSrc = getCloneImage(clone);
  const rarity = clone.rarity || "unknown";

  modalBody.innerHTML = `
        <div class="spotlight">
            <div class="spotlight-frame rarity-${rarity}">
                <img class="spotlight-img" src="${imgSrc}" alt="${clone.name}" />
            </div>
            <div class="spotlight-info">
                <h2 class="spotlight-name">${clone.name}</h2>
                <span class="rarity-badge rarity-${rarity}">${rarity}</span>
                <div class="spotlight-metrics">
                    <div class="metric-pill"><span>Win Rate</span><strong class="${winRateClass}">${clone.winRate.toFixed(2)}%</strong></div>
                    <div class="metric-pill"><span>Usage</span><strong>${clone.usage.toFixed(2)}%</strong></div>
                    <div class="metric-pill"><span>Matches</span><strong>${clone.sampleSize.toLocaleString()}</strong></div>
                </div>
                <p class="spotlight-note">Detailed matchup and deck composition data unavailable from current feed.</p>
            </div>
        </div>
    `;

  const img = modalBody.querySelector(".spotlight-img");
  img.onerror = () => {
    const initial = clone.name.charAt(0).toUpperCase();
    img.replaceWith(
      Object.assign(document.createElement("div"), {
        className: "clone-icon-placeholder",
        textContent: initial,
      }),
    );
  };

  modal.classList.remove("hidden");
}


trophySelect.addEventListener("change", loadData);
raritySelect.addEventListener("change", processAndRender);
sortSelect.addEventListener("change", processAndRender);
retryBtn.addEventListener("click", loadData);
modalClose.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.add("hidden");
});


document.addEventListener("DOMContentLoaded", loadData);
