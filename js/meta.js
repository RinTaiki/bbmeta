import { fetchMetaDecks } from "./api.js";
import { CLONE_META } from "./clone-meta.js";
let decks = [],
  state = "loading",
  generation = 0,
  controller,
  visibleCount = 12;
const $ = (id) => document.getElementById(id);
document.addEventListener("DOMContentLoaded", () => {
  $("trophy-filter").addEventListener("click", (event) => {
    const chip = event.target.closest("button");
    if (!chip || chip.classList.contains("active")) return;
    $("trophy-filter")
      .querySelectorAll("button")
      .forEach((button) => {
        button.classList.toggle("active", button === chip);
        button.setAttribute("aria-pressed", String(button === chip));
      });
    loadDecks();
  });
  $("timeframe-select").addEventListener("change", loadDecks);
  $("sort-select").addEventListener("change", () => {
    visibleCount = 12;
    render();
  });
  $("deck-search").addEventListener("input", () => {
    visibleCount = 12;
    render();
  });
  $("retry-btn").addEventListener("click", loadDecks);
  $("load-more").addEventListener("click", () => {
    visibleCount += 12;
    render();
  });
  loadDecks();
});
function number(value) {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function normalize(items) {
  const fractional = (key) =>
    items.every(
      (item) => number(item?.[key]) == null || number(item[key]) <= 1,
    );
  const winFraction = fractional("winRate"),
    usageFraction = fractional("usageRate");
  return items
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      winRate: percent(item.winRate, winFraction),
      usageRate: percent(item.usageRate, usageFraction),
      sampleSize: number(item.sampleSize),
      units: (Array.isArray(item.units) ? item.units : [])
        .slice(0, 8)
        .map((unit) => {
          const obj = unit && typeof unit === "object" ? unit : { id: unit };
          const meta = CLONE_META[obj.unitId ?? obj.id];
          const name = String(obj.displayName || obj.name || "Unknown clone");
          const file =
            meta?.file ||
            Object.values(CLONE_META).find(
              (m) =>
                m.file?.replace(".png", "") ===
                name.toLowerCase().replace(/[^a-z0-9]/g, ""),
            )?.file;
          return { name, file };
        }),
    }));
}
function percent(value, fractional) {
  const n = number(value);
  if (n == null) return null;
  const p = n * (fractional ? 100 : 1);
  return p <= 100 ? p : null;
}
async function loadDecks() {
  const token = ++generation;
  controller?.abort();
  controller = new AbortController();
  decks = [];
  visibleCount = 12;
  state = "loading";
  updateSummary();
  showState("loading");
  const chip = $("trophy-filter").querySelector(".active");
  try {
    const items = await fetchMetaDecks(
      Number($("timeframe-select").value),
      100,
      {
        minTrophies: chip.dataset.min ? Number(chip.dataset.min) : null,
        maxTrophies: chip.dataset.max ? Number(chip.dataset.max) : null,
        signal: controller.signal,
      },
    );
    if (token !== generation) return;
    decks = normalize(items);
    state = "ready";
    updateSummary();
    render();
  } catch (error) {
    if (token !== generation || error.name === "AbortError") return;
    state = "error";
    showState("error");
  }
}
function updateSummary() {
  $("deck-count").textContent =
    state === "loading" ? "—" : decks.length.toLocaleString();
  const wins = decks.map((d) => d.winRate).filter((v) => v != null);
  $("best-win").textContent = wins.length
    ? Math.max(...wins).toFixed(1) + "%"
    : "—";
  const samples = decks.map((d) => d.sampleSize).filter((v) => v != null);
  $("sample-count").textContent = samples.length
    ? Math.floor(samples.reduce((a, b) => a + b, 0)).toLocaleString()
    : "—";
}
function showState(next) {
  ["loading", "error", "empty"].forEach((key) =>
    $(key + "-state").classList.toggle("hidden", next !== key),
  );
  $("decks-grid").classList.toggle("hidden", next !== "grid");
  $("deck-surface").setAttribute("aria-busy", String(next === "loading"));
  $("load-more").classList.add("hidden");
  if (next !== "grid") $("decks-grid").replaceChildren();
  $("results-label").textContent =
    {
      loading: "Preparing your playbook…",
      error: "Statistics unavailable",
      empty: "No matching decks",
    }[next] || "";
}
function escape(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function format(value, digits = 1) {
  return value == null ? "—" : value.toFixed(digits) + "%";
}
function render() {
  if (state !== "ready") return;
  const query = $("deck-search").value.trim().toLowerCase();
  const sort = $("sort-select").value;
  const sorted = [...decks].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1));
  const filtered = sorted
    .map((deck, index) => ({ deck, rank: index + 1 }))
    .filter(
      ({ deck }) =>
        !query ||
        deck.units.some((unit) => unit.name.toLowerCase().includes(query)),
    );
  if (!filtered.length) {
    showState("empty");
    return;
  }
  showState("grid");
  $("results-label").textContent =
    filtered.length + " decks · Last " + $("timeframe-select").value + " days";
  const fragment = document.createDocumentFragment();
  filtered.slice(0, visibleCount).forEach(({ deck, rank }) => {
    const card = document.createElement("article");
    card.className = "deck-card";
    const clones = deck.units
      .map(
        (unit) =>
          '<div class="clone-icon" title="' +
          escape(unit.name) +
          '">' +
          (unit.file
            ? '<img src="assets/clones/' +
              escape(unit.file) +
              '" alt="' +
              escape(unit.name) +
              '" loading="lazy" decoding="async" />'
            : escape(unit.name.charAt(0))) +
          "</div>",
      )
      .join("");
    card.innerHTML =
      '<div class="deck-card-head"><h3>Battle deck ' +
      String(rank).padStart(2, "0") +
      '</h3><span class="deck-rank">#' +
      rank +
      " / " +
      escape($("sort-select").selectedOptions[0].text) +
      '</span></div><div class="deck-clones">' +
      (clones || '<p class="deck-footnote">Clone lineup unavailable</p>') +
      '</div><div class="deck-details"><div class="deck-stats"><div><span class="deck-stat-label">Win rate</span><strong class="deck-stat-value win">' +
      format(deck.winRate) +
      '</strong></div><div><span class="deck-stat-label">Usage</span><strong class="deck-stat-value">' +
      format(deck.usageRate, 2) +
      '</strong></div><div><span class="deck-stat-label">Samples</span><strong class="deck-stat-value">' +
      (deck.sampleSize == null
        ? "—"
        : Math.floor(deck.sampleSize).toLocaleString()) +
      '</strong></div></div><div class="winrate-track" aria-hidden="true"><span class="winrate-fill" style="width:' +
      (deck.winRate ?? 0) +
      '%"></span></div><p class="deck-footnote">' +
      deck.units.length +
      " clones · " +
      (deck.sampleSize != null && deck.sampleSize < 100
        ? "Small sample — compare with care"
        : "Observed battle performance") +
      "</p></div>";
    card.querySelectorAll("img").forEach((img) =>
      img.addEventListener(
        "error",
        () => {
          img.parentElement.textContent = img.alt.charAt(0);
        },
        { once: true },
      ),
    );
    fragment.appendChild(card);
  });
  $("decks-grid").replaceChildren(fragment);
  $("load-more").classList.toggle("hidden", filtered.length <= visibleCount);
}
