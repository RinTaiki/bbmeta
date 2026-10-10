import { fetchCloneStats } from "./api.js";
import { CLONE_META } from "./clone-meta.js";

const TROPHY_BUCKETS = {
  all: { min: null, max: null },
  top: { min: 6000, max: null },
  mid: { min: 4000, max: 5999 },
  low: { min: null, max: 3999 },
};

const SKELETON_COUNT = 8;
const RARITIES = new Set(["primal", "evolved", "mythical", "unreal"]);

/* ---------- DOM ---------- */
const searchInput = document.getElementById("search-input");
const trophySelect = document.getElementById("trophy-filter");
const raritySelect = document.getElementById("rarity-filter");
const manaSelect = document.getElementById("mana-filter");
const timeframeSelect = document.getElementById("timeframe-filter");
const sortSelect = document.getElementById("sort-filter");
const gridContainer = document.getElementById("clone-grid");
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const emptyState = document.getElementById("empty-state");
const retryBtn = document.getElementById("retry-btn");
const mainEl = document.querySelector("main.clones-page");

/* ---------- Cached formatters ---------- */
const numFmt = new Intl.NumberFormat();
const pct1Fmt = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const escapeHtml = (() => {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  const re = /[&<>"']/g;
  return (s) => String(s).replace(re, (c) => map[c]);
})();

function normalizePercentage(value, fraction = false) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, fraction ? number * 100 : number));
}

function formatPercent(value) {
  return value == null ? "—" : pct1Fmt.format(value) + "%";
}

/* ---- NEW win-rate thresholds ---- */
/*  < 49  → red   (win-low)
   49–51  → amber (win-med)
    > 51  → green (win-high) */
function getWinRateClass(winRate) {
  if (winRate == null) return "win-unknown";
  if (winRate > 51) return "win-high";
  if (winRate >= 49) return "win-med";
  return "win-low";
}

function formatIconFilename(id, name) {
  return String(name || id || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/* ---------- State ---------- */
let allClones = [];
let fetchToken = 0;
let renderQueued = false;
let dataReady = false;
let requestController = new AbortController();

/* ---------- Load ---------- */
async function loadData() {
  const token = ++fetchToken;
  requestController.abort();
  requestController = new AbortController();
  dataReady = false;
  allClones = [];
  cloneById.clear();
  closeModal();
  showState("loading");
  document.getElementById("clone-total").textContent = "—";
  document.getElementById("clone-most-used").textContent = "—";
  updateFilterContext();

  const bucket = TROPHY_BUCKETS[trophySelect.value] || TROPHY_BUCKETS.all;
  try {
    const list = await fetchCloneStats(
      bucket.min,
      bucket.max,
      timeframeSelect.value,
      { signal: requestController.signal },
    );
    if (token !== fetchToken) return;
    // The endpoint uses ratios; older percentage snapshots are also accepted.
    const winValues = list
      .filter((item) => item && item.winRate != null && item.winRate !== "")
      .map((item) => Number(item.winRate))
      .filter(Number.isFinite);
    const fractionalWins =
      winValues.length > 0 &&
      winValues.every((value) => value >= 0 && value <= 1);
    const seen = new Set();
    allClones = list
      .filter((item) => item && typeof item === "object")
      .map((item) => processClone(item, fractionalWins))
      .filter((clone) => {
        if (seen.has(clone.id)) return false;
        seen.add(clone.id);
        return true;
      });
    for (const clone of allClones) cloneById.set(clone.id, clone);
    dataReady = true;
    document.getElementById("clone-total").textContent = numFmt.format(
      allClones.length,
    );
    const mostUsed = allClones
      .filter((clone) => clone.usage != null)
      .sort((a, b) => b.usage - a.usage)[0];
    document.getElementById("clone-most-used").textContent =
      mostUsed?.name || "—";
    scheduleRender();
  } catch (error) {
    if (token !== fetchToken) return;
    console.error("Failed to load clone stats:", error);
    showState("error");
  }
}

function processClone(item, fractionalWins) {
  const name = String(
    item.displayName || item.name || item.unitId || item.id || "Unknown Clone",
  );
  const id = String(item.unitId ?? item.id ?? name);
  const nameKey = formatIconFilename(null, name);
  const resolvedMeta = Object.entries(CLONE_META).find(
    ([, meta]) =>
      meta.file &&
      formatIconFilename(null, meta.file.replace(/\.png$/, "")) === nameKey,
  );
  const metaId = CLONE_META[id] ? id : resolvedMeta?.[0] || id;
  const meta = CLONE_META[metaId] || {};
  const rawRarity = String(
    meta.rarity || item.rarity || "unknown",
  ).toLowerCase();
  const rarity = RARITIES.has(rawRarity) ? rawRarity : "unknown";
  const manaRaw = meta.mana ?? item.mana ?? item.manaCost;
  const manaNumber = manaRaw == null || manaRaw === "" ? NaN : Number(manaRaw);
  const mana =
    Number.isFinite(manaNumber) && manaNumber >= 0 ? manaNumber : null;
  const sample = Number(item.sampleSize ?? item.matches ?? 0);
  return {
    id,
    metaId,
    name,
    rarity,
    mana,
    usage: normalizePercentage(
      item.usageRate ?? item.usage,
      item.usageRate != null,
    ),
    winRate: normalizePercentage(item.winRate, fractionalWins),
    sampleSize: Number.isFinite(sample) ? Math.max(0, Math.trunc(sample)) : 0,
    imgSrc: meta.file
      ? `assets/clones/${meta.file}`
      : `assets/clones/${nameKey}.png`,
    initial: Array.from(name)[0].toUpperCase(),
    searchKey: name.toLowerCase(),
  };
}

function updateFilterContext() {
  const trophy = trophySelect.selectedOptions[0].textContent.trim();
  const window = timeframeSelect.selectedOptions[0].textContent.trim();
  document.getElementById("clone-window").textContent = window;
  document.getElementById("clone-filter-context").textContent =
    `${trophy} · ${window}`;
}

/* ---------- States ---------- */
function showState(state) {
  const isLoading = state === "loading";
  const isGrid = state === "grid";

  loadingState.classList.toggle("hidden", !isLoading);
  errorState.classList.toggle("hidden", state !== "error");
  emptyState.classList.toggle("hidden", state !== "empty");
  gridContainer.classList.toggle("hidden", !isGrid);

  if (mainEl) mainEl.setAttribute("aria-busy", String(isLoading));

  if (state === "loading")
    document.getElementById("clone-results").textContent =
      "Loading the collection...";
  if (state === "error")
    document.getElementById("clone-results").textContent =
      "Collection unavailable";
  if (isLoading) {
    loadingState.innerHTML = skeletonHTML(SKELETON_COUNT);
  } else if (!isGrid) {
    gridContainer.replaceChildren();
  }
}

function skeletonHTML(count) {
  let out =
    '<p class="loading-label">Preparing the collection...</p><div class="skeleton-grid" aria-hidden="true">';
  for (let i = 0; i < count; i++) out += '<div class="skeleton-card"></div>';
  return out + "</div>";
}

/* ---------- rAF-batched render ---------- */
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    applyFiltersAndRender();
  });
}

function applyFiltersAndRender() {
  if (!dataReady) return;
  const rarity = raritySelect.value.toLowerCase();
  const mana = manaSelect.value;
  const sortBy = sortSelect.value;
  const query = searchInput.value.trim().toLowerCase();

  let filtered = allClones;

  if (rarity !== "all") {
    filtered = filtered.filter((c) => c.rarity === rarity);
  }

  if (mana !== "all") {
    const manaNum = parseInt(mana, 10);
    filtered =
      manaNum >= 8
        ? filtered.filter((c) => c.mana != null && c.mana >= 8)
        : filtered.filter((c) => c.mana != null && c.mana === manaNum);
  }

  if (query) {
    filtered = filtered.filter((c) => c.searchKey.includes(query));
  }

  document.getElementById("clone-results").textContent =
    `${filtered.length} of ${allClones.length} clones`;
  if (filtered.length === 0) {
    showState("empty");
    return;
  }

  const sorted = filtered.slice();
  switch (sortBy) {
    case "winRate":
      sorted.sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1));
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "sampleSize":
      sorted.sort((a, b) => b.sampleSize - a.sampleSize);
      break;
    default:
      sorted.sort((a, b) => (b.usage ?? -1) - (a.usage ?? -1));
  }

  renderGrid(sorted);
  showState("grid");
}

function renderGrid(clones) {
  const parts = new Array(clones.length);
  for (let i = 0; i < clones.length; i++) parts[i] = cardHTML(clones[i], i);
  gridContainer.innerHTML = parts.join("");
}

/* ------------------------------------------------------------------ */
/*  Card template — now a modal trigger, not a link                    */
/* ------------------------------------------------------------------ */
function cardHTML(clone, index) {
  const winClass = getWinRateClass(clone.winRate);
  const aria = `${clone.name}, usage ${formatPercent(clone.usage)}, win rate ${formatPercent(clone.winRate)}. Open details.`;
  return `<article class="clone-card rarity-${clone.rarity}" role="button" tabindex="0"
    data-id="${escapeHtml(clone.id)}" aria-haspopup="dialog" aria-label="${escapeHtml(aria)}">
    <div class="clone-avatar-container">
      <div class="card-art-meta"><span class="card-number">${String(index + 1).padStart(2, "0")} / COLLECTION</span>
      ${clone.mana == null ? "" : '<span class="card-mana" title="Mana cost">' + escapeHtml(clone.mana) + " MANA</span>"}</div>
      <img class="clone-icon" src="${escapeHtml(clone.imgSrc)}" alt="" width="125" height="138" data-initial="${escapeHtml(clone.initial)}" loading="lazy" decoding="async" draggable="false" />
    </div>
    <div class="card-content">
      <div class="clone-info"><h3 class="clone-name" title="${escapeHtml(clone.name)}">${escapeHtml(clone.name)}</h3>
        <span class="rarity-badge">${escapeHtml(clone.rarity)}</span></div>
      <div class="metric-row">
        <div class="metric-labels"><span>Usage</span><strong>${formatPercent(clone.usage)}</strong></div>
        <div class="metric-bar-bg" aria-hidden="true"><div class="metric-bar-fill usage-fill" style="width:${clone.usage ?? 0}%"></div></div>
      </div>
      <div class="metric-row">
        <div class="metric-labels"><span>Win rate</span><strong class="${winClass}">${formatPercent(clone.winRate)}</strong></div>
        <div class="metric-bar-bg" aria-hidden="true"><div class="metric-bar-fill ${winClass}-fill" style="width:${clone.winRate ?? 0}%"></div></div>
      </div>
      <div class="card-footer"><span class="clone-sample">${numFmt.format(clone.sampleSize)} samples</span><span class="card-details">View details &nearr;</span></div>
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ */
/*  Modal — liquid-glass clone info card                               */
/* ------------------------------------------------------------------ */
const modalEl = document.getElementById("clone-modal");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");

let lastFocused = null;
let cloneById = new Map(); // id → clone (all clones, rebuilt on each load)
let backgroundInert = new Map();

function iconFor(id, name) {
  const meta = CLONE_META[id];
  if (meta && meta.file) return `assets/clones/${meta.file}`;
  return `assets/clones/${formatIconFilename(id, name)}.png`;
}

/* Format helpers for the modal */
function fmtStat(v) {
  if (v == null || v === "" || Number.isNaN(v)) return "—";
  return typeof v === "number" ? numFmt.format(v) : String(v);
}

function renderManaBadge(mana) {
  if (mana == null) return "";
  return `<span class="info-mana" title="Mana cost">
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor"/>
    </svg>${escapeHtml(mana)}
  </span>`;
}

function renderRoleTags(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return "";
  return roles
    .map((r) => `<span class="role-tag">${escapeHtml(r)}</span>`)
    .join("");
}

function renderMetaBar(label, value, cls) {
  const w = value == null ? 0 : Math.max(0, Math.min(value, 100));
  return `<div class="info-bar-row">
    <div class="info-bar-head">
      <span>${escapeHtml(label)}</span>
      <strong class="${cls || ""}">${formatPercent(value)}</strong>
    </div>
    <div class="info-bar-track">
      <div class="info-bar-fill ${cls ? cls + "-fill" : "usage-fill"}" style="width:${w}%"></div>
    </div>
  </div>`;
}

function renderStatsPanel(stats) {
  if (!stats) {
    return `<div class="panel-empty">Base stats unavailable.</div>`;
  }
  const rows = [
    ["Health", stats.hp ?? stats.health],
    ["Damage", stats.damage],
    ["Speed", stats.speed],
    ["Range", stats.range],
    ["Hit Speed", stats.hitSpeed],
    ["Targets", stats.targets],
  ].filter(([, v]) => v != null && v !== "");

  if (rows.length === 0) {
    return `<div class="panel-empty">Base stats unavailable.</div>`;
  }

  return `<dl class="stats-grid">
    ${rows
      .map(
        ([k, v]) => `
      <div class="stat-cell">
        <dt>${escapeHtml(k)}</dt>
        <dd>${escapeHtml(fmtStat(v))}</dd>
      </div>`,
      )
      .join("")}
  </dl>`;
}

function renderCombosPanel(combos) {
  if (!Array.isArray(combos) || combos.length === 0) {
    return `<div class="panel-empty">No known combos yet.</div>`;
  }
  return `<ul class="combo-list">
    ${combos
      .slice(0, 6)
      .map((c) => {
        const withName = c.with || c.name || c.partner || "";
        const effect = c.effect || c.note || c.description || "";
        const withIcon = c.withId
          ? `<img class="combo-icon" src="${escapeHtml(iconFor(c.withId, withName))}" alt="" loading="lazy" decoding="async" draggable="false" />`
          : "";
        return `<li class="combo-row">
        ${withIcon}
        <span class="combo-name">${escapeHtml(withName)}</span>
        ${effect ? `<span class="combo-arrow">→</span><span class="combo-effect">${escapeHtml(effect)}</span>` : ""}
      </li>`;
      })
      .join("")}
  </ul>`;
}

function renderTopDecksPanel(decks) {
  if (!Array.isArray(decks) || decks.length === 0) {
    return `<div class="panel-empty">No deck data yet.</div>`;
  }
  return `<ul class="deck-list">
    ${decks
      .slice(0, 4)
      .map((d) => {
        const win =
          typeof d.winRate === "number"
            ? d.winRate
            : parseFloat(d.winRate) || 0;
        const uses = d.uses ?? d.matches ?? d.sampleSize ?? 0;
        const cards = Array.isArray(d.cards) ? d.cards.slice(0, 8) : [];
        const deckIcons = cards
          .map((card) => {
            const cid = String(card.id || card.unitId || card.name || "");
            const cname = card.name || cid;
            return `<img class="deck-mini" src="${escapeHtml(iconFor(cid, cname))}" alt="" loading="lazy" decoding="async" draggable="false" />`;
          })
          .join("");
        const wrClass = getWinRateClass(win);
        return `<li class="deck-row">
        <div class="deck-icons">${deckIcons || '<span class="panel-empty small">No deck list</span>'}</div>
        <div class="deck-meta">
          <strong class="${wrClass}">${pct1Fmt.format(win)}%</strong>
          <span>${numFmt.format(uses)} uses</span>
        </div>
      </li>`;
      })
      .join("")}
  </ul>`;
}

function buildModalHTML(clone) {
  const meta = CLONE_META[clone.metaId] || {};
  const roles = meta.roles || [];
  const arena = meta.arena ?? meta.arenaName ?? null;
  const mana = clone.mana ?? meta.mana ?? null;
  const stats = meta.stats || meta.baseStats || null;
  const combos = meta.combos || meta.synergies || [];
  const topDecks = meta.topDecks || meta.decks || [];

  const wrClass = getWinRateClass(clone.winRate);
  const metaLine = [
    `<span class="rarity-badge rarity-${clone.rarity}">${escapeHtml(clone.rarity)}</span>`,
    arena ? `<span class="info-arena">${escapeHtml(arena)}</span>` : "",
    renderManaBadge(mana),
  ]
    .filter(Boolean)
    .join("");

  return `
    <header class="info-hero rarity-${clone.rarity}">
      <div class="info-avatar">
        <img class="info-avatar-img" src="${escapeHtml(clone.imgSrc)}"
             alt="" loading="eager" decoding="async" draggable="false"
             data-initial="${escapeHtml(clone.initial)}" />
      </div>
      <div class="info-heading">
        <h2 class="info-title" id="modal-title">${escapeHtml(clone.name)}</h2>
        <div class="info-meta">${metaLine}</div>
        ${roles.length ? `<div class="role-row">${renderRoleTags(roles)}</div>` : ""}
      </div>
    </header>

    <div class="info-body">
      <section class="info-col info-col-left" aria-labelledby="sec-stats">
        <div class="info-panel">
          <h3 class="panel-title" id="sec-stats">Base stats</h3>
          ${renderStatsPanel(stats)}
        </div>
      </section>

      <section class="info-col info-col-right">
        <div class="info-panel">
          <h3 class="panel-title">Meta performance</h3>
          ${renderMetaBar("Usage", clone.usage)}
          ${renderMetaBar("Win Rate", clone.winRate, wrClass)}
          <div class="sample-line">Sample: <strong>${numFmt.format(clone.sampleSize)}</strong> appearances</div>
        </div>

        <div class="info-panel">
          <h3 class="panel-title">Combos &amp; synergies</h3>
          ${renderCombosPanel(combos)}
        </div>

        <div class="info-panel">
          <h3 class="panel-title">Top decks using this clone</h3>
          ${renderTopDecksPanel(topDecks)}
        </div>
      </section>
    </div>
  `;
}

function openModal(clone, sourceEl) {
  if (!modalEl) return;
  lastFocused = sourceEl || document.activeElement;
  modalBody.innerHTML =
    buildModalHTML(clone) +
    '<a class="modal-deck-link" href="deck-builder.html">Build a deck with your favorites &rarr;</a>';
  document.querySelector(".modal-card").scrollTop = 0;
  for (const element of document.querySelectorAll(
    "body > header, body > main, body > footer",
  )) {
    backgroundInert.set(element, element.inert);
    element.inert = true;
  }

  modalEl.classList.remove("hidden");
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => modalClose.focus({ preventScroll: true }));
}

function closeModal() {
  if (!modalEl || modalEl.classList.contains("hidden")) return;
  modalEl.classList.add("hidden");
  document.body.classList.remove("modal-open");
  for (const [element, wasInert] of backgroundInert) element.inert = wasInert;
  backgroundInert.clear();
  if (lastFocused?.isConnected && typeof lastFocused.focus === "function") {
    lastFocused.focus({ preventScroll: true });
  }
}

/* ------------------------------------------------------------------ */
/*  Delegated interaction — one listener for the whole grid            */
/* ------------------------------------------------------------------ */
function findCloneFromEvent(e) {
  const card = e.target.closest(".clone-card");
  if (!card || !gridContainer.contains(card)) return null;
  const id = card.dataset.id;
  if (!id) return null;
  const clone = cloneById.get(id);
  return clone ? { clone, card } : null;
}

gridContainer.addEventListener("click", (e) => {
  const found = findCloneFromEvent(e);
  if (!found) return;
  openModal(found.clone, found.card);
});

gridContainer.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const found = findCloneFromEvent(e);
  if (!found) return;
  e.preventDefault();
  openModal(found.clone, found.card);
});

modalClose.addEventListener("click", closeModal);
modalEl.addEventListener("click", (e) => {
  if (e.target === modalEl) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (modalEl.classList.contains("hidden")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
  }
  if (event.key === "Tab") {
    const focusable = [
      ...modalEl.querySelectorAll(
        'button, a[href], input, select, [tabindex="0"]',
      ),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

/* Image fallback for both grid and modal avatars */
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const isCard = img.classList.contains("clone-icon");
    const isSpotlight = img.classList.contains("info-avatar-img");
    const isMini =
      img.classList.contains("deck-mini") ||
      img.classList.contains("combo-icon");
    if (!isCard && !isSpotlight && !isMini) return;

    const ph = document.createElement("div");
    ph.className = "clone-icon-placeholder";
    if (isSpotlight) ph.classList.add("spotlight-placeholder");
    if (isMini) ph.classList.add("mini-placeholder");
    ph.textContent = (img.dataset.initial || "?").charAt(0).toUpperCase();
    img.replaceWith(ph);
  },
  true,
);

/* ---------- Events ---------- */
document.getElementById("reset-filters").addEventListener("click", () => {
  const reload = trophySelect.value !== "all" || timeframeSelect.value !== "7d";
  searchInput.value = "";
  trophySelect.value = "all";
  timeframeSelect.value = "7d";
  raritySelect.value = "all";
  manaSelect.value = "all";
  sortSelect.value = "usage";
  updateFilterContext();
  if (reload) void loadData();
  else scheduleRender();
});
searchInput.addEventListener("input", scheduleRender);
trophySelect.addEventListener("change", loadData);
timeframeSelect.addEventListener("change", loadData);
raritySelect.addEventListener("change", scheduleRender);
manaSelect.addEventListener("change", scheduleRender);
sortSelect.addEventListener("change", scheduleRender);
retryBtn.addEventListener("click", loadData);

/* Module scripts execute after DOM parse, so this is safe without DOMContentLoaded. */
loadData();
