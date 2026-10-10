import { fetchLeaderboard, fetchPlayerProfile } from "./api.js";
import { CLONE_META } from "./clone-meta.js";
import { showNotification } from "./notifications.js";

const PAGE_SIZE = 50;
let rawLeaderboardData = [];
let filteredData = [];
let rankChanges = {};
let displayedCount = PAGE_SIZE;
let leaderboardRequestId = 0;
let loading = true;
let leaderboardAvailable = false;
let rowObserver;
let searchTimer;
let profileWorkerRunning = false;
let profileController = new AbortController();
const profileQueue = [];
const pendingProfiles = new Set();

document.addEventListener("DOMContentLoaded", () => {
  const search = document.getElementById("search-input");
  search.addEventListener("input", () => {
    document
      .getElementById("clear-search-btn")
      .classList.toggle("hidden", !search.value);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applySearch, 120);
  });
  document.getElementById("clear-search-btn").addEventListener("click", () => {
    search.value = "";
    clearTimeout(searchTimer);
    applySearch();
    search.focus();
  });
  document
    .getElementById("country-filter")
    .addEventListener("change", (event) => {
      void loadLeaderboardData(event.target.value);
    });
  document.getElementById("retry-btn").addEventListener("click", () => {
    void loadLeaderboardData(document.getElementById("country-filter").value);
  });
  document.getElementById("load-more-btn").addEventListener("click", () => {
    displayedCount += PAGE_SIZE;
    renderTable();
  });
  void loadLeaderboardData();
});

function numeric(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePlayers(data) {
  if (!Array.isArray(data)) throw new Error("Invalid leaderboard response");
  const seen = new Set();
  return data
    .filter((player) => {
      if (
        !player ||
        typeof player.tag !== "string" ||
        !player.tag ||
        seen.has(player.tag)
      )
        return false;
      seen.add(player.tag);
      return true;
    })
    .map((player, index) => ({
      ...player,
      name: String(player.name || "Unknown brawler"),
      rank: Math.max(1, Math.trunc(numeric(player.rank, index + 1))),
      trophies: Math.max(0, numeric(player.trophies)),
      winRateValue:
        player.winRateValue == null ||
        !Number.isFinite(Number(player.winRateValue))
          ? null
          : Math.min(100, Math.max(0, Number(player.winRateValue))),
      profileLoaded: false,
    }));
}

async function loadLeaderboardData(country = "") {
  const requestId = ++leaderboardRequestId;
  profileController.abort();
  profileController = new AbortController();
  loading = true;
  leaderboardAvailable = false;
  rowObserver?.disconnect();
  // Drop queued work from the previous arena. In-flight work checks its generation.
  profileQueue.length = 0;
  pendingProfiles.clear();
  rawLeaderboardData = [];
  filteredData = [];
  showState("loading");
  document.getElementById("podium-section").classList.add("hidden");
  document.getElementById("arena-count").textContent = "—";
  document.getElementById("arena-trophies").textContent = "—";
  const select = document.getElementById("country-filter");
  const region = country
    ? select.selectedOptions[0].textContent.trim()
    : "Worldwide";
  document.getElementById("arena-region").textContent = region;
  try {
    const [players, changes] = await Promise.all([
      fetchLeaderboard(country, 200, { signal: profileController.signal }),
      country
        ? Promise.resolve({})
        : fetchRankChanges(profileController.signal),
    ]);
    if (requestId !== leaderboardRequestId) return;
    rawLeaderboardData = normalizePlayers(players);
    rankChanges = changes;
    loading = false;
    leaderboardAvailable = true;
    document.getElementById("arena-count").textContent =
      rawLeaderboardData.length.toLocaleString();
    document.getElementById("arena-trophies").textContent =
      rawLeaderboardData.length
        ? Math.max(
            ...rawLeaderboardData.map((player) => player.trophies),
          ).toLocaleString()
        : "—";
    renderPodium(country ? region : null);
    applySearch();
  } catch (error) {
    if (requestId !== leaderboardRequestId) return;
    loading = false;
    console.error("Leaderboard load error:", error);
    showState("error");
  }
}

async function fetchRankChanges(signal) {
  try {
    const base = ["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? "https://bbmeta.vercel.app"
      : "";
    const response = await fetch(`${base}/api/rank-changes`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok) return {};
    const data = await response.json();
    return data.changes && typeof data.changes === "object" ? data.changes : {};
  } catch {
    return {};
  }
}

function clanName(player) {
  return typeof player.clan === "string"
    ? player.clan
    : String(player.clan?.name || "No Clan");
}

function renderPodium(region) {
  const grid = document.getElementById("podium-grid");
  const leaders = [...rawLeaderboardData]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);
  const emotes = [
    "king-celebration.png",
    "king-omg-silver.png",
    "king-angry-bronze.png",
  ];
  const fragment = document.createDocumentFragment();
  leaders.forEach((player, index) => {
    const card = document.createElement("a");
    card.className = `podium-card podium-${index + 1}`;
    card.href = `profile.html?tag=${encodeURIComponent(player.tag)}`;
    card.setAttribute(
      "aria-label",
      `Rank ${player.rank}: ${player.name}, ${player.trophies.toLocaleString()} trophies. Open profile.`,
    );
    card.innerHTML = `<img class="podium-emote" src="assets/emotes/${emotes[index]}" alt="" width="76" height="76" decoding="async" />
      <div><span class="podium-rank">${index === 0 ? "The front runner" : "Rank " + player.rank}</span>
      <strong class="podium-name">${escapeHTML(player.name)}</strong>
      <span class="podium-clan">${escapeHTML(clanName(player))}</span>
      <span class="podium-trophies"><img src="assets/icons/trophiestotal.png" alt="" width="20" height="20" />${player.trophies.toLocaleString()}</span></div>`;
    fragment.appendChild(card);
  });
  grid.replaceChildren(fragment);
  document.getElementById("podium-scope").textContent = region
    ? `Top players in ${region}`
    : "Top players in the global rankings";
  document
    .getElementById("podium-section")
    .classList.toggle("hidden", leaders.length === 0);
}

function applySearch() {
  const query = document
    .getElementById("search-input")
    .value.toLowerCase()
    .trim();
  document
    .getElementById("clear-search-btn")
    .classList.toggle("hidden", !query);
  if (loading || !leaderboardAvailable) return;
  filteredData = rawLeaderboardData.filter(
    (player) =>
      player.name.toLowerCase().includes(query) ||
      player.tag.toLowerCase().includes(query),
  );
  displayedCount = PAGE_SIZE;
  renderTable();
}

function movementHTML(player) {
  const raw = rankChanges[player.tag];
  if (raw == null || !Number.isFinite(Number(raw))) return "";
  const change = Math.trunc(Number(raw));
  if (!change)
    return '<span class="rank-change even" title="No rank change">—</span>';
  const direction = change > 0 ? "up" : "down";
  const icon = change > 0 ? "leaderboardup.png" : "leadeboarddown.png";
  return `<span class="rank-change ${direction}" title="${change > 0 ? "Climbed" : "Fell"} ${Math.abs(change)} places"><img class="rank-change-icon" src="assets/icons/${icon}" alt="" width="10" height="12" />${Math.abs(change)}</span>`;
}

function renderTable() {
  rowObserver?.disconnect();
  const tbody = document.getElementById("leaderboard-body");
  const visiblePlayers = filteredData.slice(0, displayedCount);
  document.getElementById("results-count").textContent = filteredData.length
    ? `Showing ${visiblePlayers.length} of ${filteredData.length} players`
    : "No matching players";
  tbody.replaceChildren();
  if (!filteredData.length) {
    showState("empty");
    return;
  }
  showState("table");
  const fragment = document.createDocumentFragment();
  visiblePlayers.forEach((player) => {
    const row = document.createElement("tr");
    if (player.rank <= 3) row.classList.add("top-row");
    const rankClass = player.rank <= 3 ? `rank-${player.rank}` : "";
    const rate = player.winRateValue;
    const rateClass = rate === null ? "" : rate >= 50 ? "is-good" : "is-bad";
    const tag = escapeHTML(player.tag);
    const href = `profile.html?tag=${encodeURIComponent(player.tag)}`;
    row.innerHTML = `
      <td class="col-rank"><span class="badge-rank ${rankClass}">${player.rank}</span></td>
      <td class="col-player"><a class="player-name" href="${href}">${escapeHTML(player.name)}</a>
        <span class="player-tag-wrap"><span class="player-tag">${tag}</span>
          <button type="button" class="copy-tag-btn" title="Copy tag" aria-label="Copy tag ${tag}">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button></span>${movementHTML(player)}</td>
      <td class="col-trophies"><span class="trophy-count"><img class="trophy-icon" src="assets/icons/trophiestotal.png" alt="" width="22" height="22" decoding="async" />${player.trophies.toLocaleString()}</span></td>
      <td class="col-clan">${escapeHTML(clanName(player))}</td>
      <td class="col-deck"><div class="deck-cell" data-tag="${tag}" title="Main deck loading"><span class="deck-loading">…</span></div></td>
      <td class="col-winrate"><div class="winrate-wrap"><div class="winrate-bar" aria-hidden="true"><span class="${rateClass}" style="width:${rate ?? 0}%"></span></div>
        <span class="winrate-value ${rateClass}" data-tag="${tag}">${rate === null ? (player.profileLoaded ? "—" : "…") : rate.toFixed(1) + "%"}</span></div></td>`;
    row.querySelector(".copy-tag-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      void handleCopyTag(event.currentTarget, player.tag);
    });
    row.addEventListener("click", (event) => {
      if (
        !event.target.closest("a, button") &&
        !window.getSelection()?.toString()
      ) {
        window.location.href = href;
      }
    });
    row._player = player;
    fragment.appendChild(row);
  });
  tbody.appendChild(fragment);
  visiblePlayers.forEach((player) => {
    if (player.deckLoaded) updateDeckCell(player.tag, player.deck);
    else if (player.profileLoaded) updateDeckUnavailable(player.tag);
  });
  document
    .getElementById("pagination-container")
    .classList.toggle("hidden", displayedCount >= filteredData.length);
  const requestId = leaderboardRequestId;
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const players = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => {
            observer.unobserve(entry.target);
            return entry.target._player;
          });
        queueProfiles(players, requestId);
      },
      { rootMargin: "160px 0px" },
    );
    rowObserver = observer;
    for (const row of tbody.children) observer.observe(row);
  } else {
    queueProfiles(visiblePlayers, requestId);
  }
}

async function handleCopyTag(button, tag) {
  let copied = false;
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(tag);
      copied = true;
    }
  } catch {}
  if (!copied) copied = fallbackCopy(tag);
  if (!copied) {
    showNotification(
      "Could not copy the tag. Select it to copy manually.",
      "warning",
    );
    return;
  }
  button.classList.add("copied");
  button.setAttribute("aria-label", "Tag copied");
  showNotification(`Copied ${tag} to clipboard`, "success", 2000);
  setTimeout(() => {
    button.classList.remove("copied");
    button.setAttribute("aria-label", `Copy tag ${tag}`);
  }, 1800);
}

function fallbackCopy(text) {
  const input = document.createElement("textarea");
  input.value = text;
  input.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(input);
  input.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {}
  input.remove();
  return copied;
}

// One shared worker prevents search/pagination from spawning overlapping batches.
function queueProfiles(players, requestId) {
  if (requestId !== leaderboardRequestId) return;
  players.forEach((player) => {
    const key = `${requestId}:${player.tag}`;
    if (player.profileLoaded || pendingProfiles.has(key)) return;
    pendingProfiles.add(key);
    profileQueue.push({ player, requestId, key });
  });
  void processProfiles();
}

async function processProfiles() {
  if (profileWorkerRunning) return;
  profileWorkerRunning = true;
  try {
    while (profileQueue.length) {
      const batch = profileQueue.splice(0, 3);
      await Promise.allSettled(
        batch.map(async ({ player, requestId, key }) => {
          try {
            if (
              requestId !== leaderboardRequestId ||
              !filteredData.includes(player)
            )
              return;
            const result = await fetchProfileDetails(
              player.tag,
              requestId,
              profileController.signal,
            );
            if (requestId !== leaderboardRequestId) return;
            player.profileLoaded = true;
            player.winRateValue = result?.rate ?? null;
            player.deck = result?.deck || [];
            player.deckLoaded = player.deck.length > 0;
            updateWinRateCell(player.tag, player.winRateValue);
            if (player.deckLoaded) updateDeckCell(player.tag, player.deck);
            else updateDeckUnavailable(player.tag);
          } finally {
            pendingProfiles.delete(key);
          }
        }),
      );
      if (profileQueue.length) await sleep(120);
    }
  } finally {
    profileWorkerRunning = false;
  }
}

async function fetchProfileDetails(tag, requestId, signal) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (requestId !== leaderboardRequestId || signal.aborted) return null;
    try {
      const profile = await fetchPlayerProfile(tag, { signal });
      const recent = profile.recentWins != null && profile.recentLosses != null;
      const wins = Math.max(
        0,
        numeric(recent ? profile.recentWins : profile.wins),
      );
      const losses = Math.max(
        0,
        numeric(recent ? profile.recentLosses : profile.losses),
      );
      const total = wins + losses;
      return {
        rate: total > 0 ? (wins / total) * 100 : null,
        deck: Array.isArray(profile.currentDeck) ? profile.currentDeck : [],
      };
    } catch {
      if (signal.aborted) return null;
      if (attempt === 0) await sleep(350);
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateWinRateCell(tag, rate) {
  const cell = document.querySelector(
    `.winrate-value[data-tag="${CSS.escape(tag)}"]`,
  );
  if (!cell) return;
  cell.textContent = rate === null ? "—" : rate.toFixed(1) + "%";
  cell.classList.remove("is-good", "is-bad");
  if (rate !== null) cell.classList.add(rate >= 50 ? "is-good" : "is-bad");
  const bar = cell.previousElementSibling?.firstElementChild;
  if (bar) {
    bar.style.width = `${rate ?? 0}%`;
    bar.classList.remove("is-good", "is-bad");
    if (rate !== null) bar.classList.add(rate >= 50 ? "is-good" : "is-bad");
  }
}

function updateDeckCell(tag, deck) {
  const cell = document.querySelector(
    `.deck-cell[data-tag="${CSS.escape(tag)}"]`,
  );
  if (!cell) return;
  cell.replaceChildren();
  const names = [];
  deck.slice(0, MAX_DECK_ICONS).forEach((unit) => {
    const { file, label } = resolveCloneByUnit(unit);
    names.push(label);
    const slot = document.createElement("span");
    slot.className = "deck-icon";
    slot.title = label;
    const image = document.createElement("img");
    image.src = file;
    image.alt = label;
    image.loading = "lazy";
    image.decoding = "async";
    image.width = 26;
    image.height = 26;
    image.onerror = () => {
      slot.classList.add("is-fallback");
      slot.dataset.fallback = String(label || "?")
        .charAt(0)
        .toUpperCase();
      image.remove();
    };
    slot.appendChild(image);
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
  const dash = document.createElement("span");
  dash.className = "deck-unavailable";
  dash.textContent = "—";
  cell.title = "No deck data";
  cell.replaceChildren(dash);
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

function showState(state) {
  for (const name of ["loading", "error", "empty"]) {
    document
      .getElementById(`${name}-state`)
      .classList.toggle("hidden", name !== state);
  }
  document
    .getElementById("table-container")
    .classList.toggle("hidden", state !== "table");
  document.getElementById("pagination-container").classList.add("hidden");
  document
    .getElementById("rankings")
    .setAttribute("aria-busy", state === "loading" ? "true" : "false");
  if (state === "loading")
    document.getElementById("results-count").textContent =
      "Loading rankings...";
  if (state === "error")
    document.getElementById("results-count").textContent =
      "Rankings unavailable";
}

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
}
