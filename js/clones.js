import { fetchCloneStats } from "./api.js";
import { CLONE_META } from "./clone-meta.js";

const TROPHY_BUCKETS = {
  all: { min: null, max: null },
  top: { min: 6000, max: null },
  mid: { min: 4000, max: 5999 },
  low: { min: null, max: 3999 },
};

const SKELETON_COUNT = 8;

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

function normalizePercentage(v) {
  const n = parseFloat(v) || 0;
  return n <= 1 ? n * 100 : n;
}

/* ---- NEW win-rate thresholds ---- */
/*  < 49  → red   (win-low)
   49–51  → amber (win-med)
    > 51  → green (win-high) */
function getWinRateClass(winRate) {
  if (winRate > 51) return "win-high";
  if (winRate >= 49) return "win-med";
  return "win-low";
}

function formatIconFilename(id, name) {
  return String(id || name || "unknown")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

/* ---------- State ---------- */
let allClones = [];
let fetchToken = 0;
let renderQueued = false;

/* ---------- Load ---------- */
async function loadData() {
  const token = ++fetchToken;
  showState("loading");

  const bucket = TROPHY_BUCKETS[trophySelect.value] || TROPHY_BUCKETS.all;
  const timeframe = timeframeSelect.value; // "season" | "7d" | "30d" | "all"

  try {
    // Assumes fetchCloneStats(min, max, timeframe). If the API ignores
    // the 3rd arg, nothing breaks — it just returns the default snapshot.
    const data = await fetchCloneStats(bucket.min, bucket.max, timeframe);
    if (token !== fetchToken) return;

    const list = Array.isArray(data) ? data : data.units || data.data || [];
    allClones = list.map(processClone);

    // Live lookup map for the modal (survives filter re-renders).
    cloneById.clear();
    for (const c of allClones) cloneById.set(c.id, c);

    scheduleRender();
  } catch (err) {
    if (token !== fetchToken) return;
    console.error("Failed to load clone stats:", err);
    showState("error");
  }
}

function processClone(item) {
  const name = item.displayName || item.name || item.id || "Unknown Clone";
  const id = String(item.unitId || item.id || name);
  const meta = CLONE_META[id] || {};
  const rarity = String(meta.rarity || item.rarity || "unknown").toLowerCase();

  const imgSrc = meta.file
    ? `assets/clones/${meta.file}`
    : `assets/clones/${formatIconFilename(id, name)}.png`;

  // Mana is optional — may live on meta or on the item.
  const manaRaw = meta.mana ?? item.mana ?? item.manaCost ?? null;
  const mana = manaRaw == null ? null : Number(manaRaw);

  return {
    id,
    name,
    usage: normalizePercentage(item.usageRate ?? item.usage),
    winRate: normalizePercentage(item.winRate),
    sampleSize: item.sampleSize || item.matches || 0,
    rarity,
    mana,
    imgSrc,
    initial: name.charAt(0).toUpperCase(),
    searchKey: name.toLowerCase(),
  };
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

  if (isLoading) {
    loadingState.innerHTML = skeletonHTML(SKELETON_COUNT);
  } else if (!isGrid) {
    gridContainer.replaceChildren();
  }
}

function skeletonHTML(count) {
  let out = '<div class="skeleton-grid" aria-hidden="true">';
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

  if (filtered.length === 0) {
    showState("empty");
    return;
  }

  const sorted = filtered.slice();
  switch (sortBy) {
    case "winRate":
      sorted.sort((a, b) => b.winRate - a.winRate);
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "sampleSize":
      sorted.sort((a, b) => b.sampleSize - a.sampleSize);
      break;
    default:
      sorted.sort((a, b) => b.usage - a.usage);
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
function cardHTML(c, i) {
  const wrClass = getWinRateClass(c.winRate);
  const usageW  = Math.min(c.usage, 100);
  const winW    = Math.min(c.winRate, 100);
  const delay   = Math.min(i, 20);
  const aria    = `${c.name} — usage ${pct1Fmt.format(c.usage)} percent, win rate ${pct1Fmt.format(c.winRate)} percent. Open details.`;

  return `<article class="clone-card rarity-${c.rarity}" role="button" tabindex="0"
            data-id="${escapeHtml(c.id)}" style="--i:${delay}" aria-label="${escapeHtml(aria)}">
    <div class="card-header">
      <div class="clone-avatar-container">
        <img class="clone-icon" src="${escapeHtml(c.imgSrc)}" alt="" data-initial="${escapeHtml(c.initial)}" loading="lazy" decoding="async" draggable="false" />
      </div>
      <div class="clone-info">
        <span class="clone-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
        <div class="clone-subline">
          <span class="rarity-badge rarity-${c.rarity}">${escapeHtml(c.rarity)}</span>
          <span class="clone-sample">${numFmt.format(c.sampleSize)} matches</span>
        </div>
      </div>
    </div>

    <div class="metric-row">
      <div class="metric-labels"><span>Usage</span><span>${pct1Fmt.format(c.usage)}%</span></div>
      <div class="metric-bar-bg"><div class="metric-bar-fill usage-fill" style="width:${usageW}%"></div></div>
    </div>

    <div class="metric-row">
      <div class="metric-labels"><span>Win Rate</span><span class="${wrClass}">${pct1Fmt.format(c.winRate)}%</span></div>
      <div class="metric-bar-bg"><div class="metric-bar-fill ${wrClass}-fill" style="width:${winW}%"></div></div>
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ */
/*  Modal — liquid-glass clone info card                               */
/* ------------------------------------------------------------------ */
const modalEl    = document.getElementById("clone-modal");
const modalBody  = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");

let lastFocused = null;
let cloneById = new Map(); // id → clone (all clones, rebuilt on each load)
let cachedCloneForId = new Map(); // id → clone (survives grid re-renders)

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
  const w = Math.max(0, Math.min(value, 100));
  return `<div class="info-bar-row">
    <div class="info-bar-head">
      <span>${escapeHtml(label)}</span>
      <strong class="${cls || ""}">${pct1Fmt.format(value)}%</strong>
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
    ["Speed",  stats.speed],
    ["Range",  stats.range],
    ["Hit Speed", stats.hitSpeed],
    ["Targets", stats.targets],
  ].filter(([, v]) => v != null && v !== "");

  if (rows.length === 0) {
    return `<div class="panel-empty">Base stats unavailable.</div>`;
  }

  return `<dl class="stats-grid">
    ${rows.map(([k, v]) => `
      <div class="stat-cell">
        <dt>${escapeHtml(k)}</dt>
        <dd>${escapeHtml(fmtStat(v))}</dd>
      </div>`).join("")}
  </dl>`;
}

function renderCombosPanel(combos) {
  if (!Array.isArray(combos) || combos.length === 0) {
    return `<div class="panel-empty">No known combos yet.</div>`;
  }
  return `<ul class="combo-list">
    ${combos.slice(0, 6).map((c) => {
      const withName = c.with || c.name || c.partner || "";
      const effect   = c.effect || c.note || c.description || "";
      const withIcon = c.withId ? `<img class="combo-icon" src="${escapeHtml(iconFor(c.withId, withName))}" alt="" loading="lazy" decoding="async" draggable="false" />` : "";
      return `<li class="combo-row">
        ${withIcon}
        <span class="combo-name">${escapeHtml(withName)}</span>
        ${effect ? `<span class="combo-arrow">→</span><span class="combo-effect">${escapeHtml(effect)}</span>` : ""}
      </li>`;
    }).join("")}
  </ul>`;
}

function renderTopDecksPanel(decks) {
  if (!Array.isArray(decks) || decks.length === 0) {
    return `<div class="panel-empty">No deck data yet.</div>`;
  }
  return `<ul class="deck-list">
    ${decks.slice(0, 4).map((d) => {
      const win  = typeof d.winRate === "number" ? d.winRate : parseFloat(d.winRate) || 0;
      const uses = d.uses ?? d.matches ?? d.sampleSize ?? 0;
      const cards = Array.isArray(d.cards) ? d.cards.slice(0, 8) : [];
      const deckIcons = cards.map((card) => {
        const cid  = String(card.id || card.unitId || card.name || "");
        const cname = card.name || cid;
        return `<img class="deck-mini" src="${escapeHtml(iconFor(cid, cname))}" alt="" loading="lazy" decoding="async" draggable="false" />`;
      }).join("");
      const wrClass = getWinRateClass(win);
      return `<li class="deck-row">
        <div class="deck-icons">${deckIcons || '<span class="panel-empty small">No deck list</span>'}</div>
        <div class="deck-meta">
          <strong class="${wrClass}">${pct1Fmt.format(win)}%</strong>
          <span>${numFmt.format(uses)} uses</span>
        </div>
      </li>`;
    }).join("")}
  </ul>`;
}

function buildModalHTML(clone) {
  const meta      = CLONE_META[clone.id] || {};
  const roles     = meta.roles || [];
  const arena     = meta.arena ?? meta.arenaName ?? null;
  const mana      = clone.mana ?? meta.mana ?? null;
  const stats     = meta.stats || meta.baseStats || null;
  const combos    = meta.combos || meta.synergies || [];
  const topDecks  = meta.topDecks || meta.decks || [];

  const wrClass = getWinRateClass(clone.winRate);
  const metaLine = [
    `<span class="rarity-badge rarity-${clone.rarity}">${escapeHtml(clone.rarity)}</span>`,
    arena ? `<span class="info-arena">${escapeHtml(arena)}</span>` : "",
    renderManaBadge(mana),
  ].filter(Boolean).join("");

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
          <h3 class="panel-title" id="sec-stats">📖 Base Stats</h3>
          ${renderStatsPanel(stats)}
        </div>
      </section>

      <section class="info-col info-col-right">
        <div class="info-panel">
          <h3 class="panel-title">📊 Meta Performance</h3>
          ${renderMetaBar("Usage", clone.usage)}
          ${renderMetaBar("Win Rate", clone.winRate, wrClass)}
          <div class="sample-line">Sample: <strong>${numFmt.format(clone.sampleSize)}</strong> decks</div>
        </div>

        <div class="info-panel">
          <h3 class="panel-title">🔗 Combos / Synergies</h3>
          ${renderCombosPanel(combos)}
        </div>

        <div class="info-panel">
          <h3 class="panel-title">🏆 Top Decks Using This Clone</h3>
          ${renderTopDecksPanel(topDecks)}
        </div>
      </section>
    </div>
  `;
}

function openModal(clone, sourceEl) {
  if (!modalEl) return;
  lastFocused = sourceEl || document.activeElement;
  modalBody.innerHTML = buildModalHTML(clone);

  modalEl.classList.remove("hidden");
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => modalClose.focus({ preventScroll: true }));
}

function closeModal() {
  if (!modalEl || modalEl.classList.contains("hidden")) return;
  modalEl.classList.add("hidden");
  document.body.classList.remove("modal-open");
  if (lastFocused && typeof lastFocused.focus === "function") {
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
  // Prefer live map, fall back to cached copies of last render
  let clone = cloneById.get(id);
  if (!clone) clone = cachedCloneForId.get(id);
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
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* Image fallback for both grid and modal avatars */
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const isCard     = img.classList.contains("clone-icon");
    const isSpotlight = img.classList.contains("info-avatar-img");
    const isMini     = img.classList.contains("deck-mini") || img.classList.contains("combo-icon");
    if (!isCard && !isSpotlight && !isMini) return;

    const ph = document.createElement("div");
    ph.className = "clone-icon-placeholder";
    if (isSpotlight) ph.classList.add("spotlight-placeholder");
    if (isMini) ph.classList.add("mini-placeholder");
    ph.textContent = (img.dataset.initial || "?").charAt(0).toUpperCase();
    img.replaceWith(ph);
  },
  true
);

/* Keep a snapshot of last-rendered clones for modal lookups after re-render */
const _originalRenderGrid = renderGrid;
renderGrid = function (clones) {
  cachedCloneForId.clear();
  for (const c of clones) cachedCloneForId.set(c.id, c);
  _originalRenderGrid(clones);
};

/* ---------- Events ---------- */
searchInput.addEventListener("input", scheduleRender);
trophySelect.addEventListener("change", loadData);
timeframeSelect.addEventListener("change", loadData);
raritySelect.addEventListener("change", scheduleRender);
manaSelect.addEventListener("change", scheduleRender);
sortSelect.addEventListener("change", scheduleRender);
retryBtn.addEventListener("click", loadData);

/* Module scripts execute after DOM parse, so this is safe without DOMContentLoaded. */
loadData();
