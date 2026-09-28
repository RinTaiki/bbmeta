// js/season-archive.js
// Fetch + render logic for the Season Archive page

(function () {
  "use strict";

  const els = {
    loading: document.getElementById("loading-state"),
    empty: document.getElementById("empty-state"),
    error: document.getElementById("error-state"),
    errorMsg: document.getElementById("error-message"),
    grid: document.getElementById("season-grid"),

    modal: document.getElementById("season-modal"),
    modalClose: document.getElementById("modal-close"),
    modalLoading: document.getElementById("modal-loading"),
    modalContent: document.getElementById("modal-content"),

    modalSeasonId: document.getElementById("modal-season-id"),
    championName: document.getElementById("champion-name"),
    championTag: document.getElementById("champion-tag"),
    championTrophies: document.getElementById("champion-trophies"),
    modalEndDate: document.getElementById("modal-end-date"),
    standingsBody: document.getElementById("standings-body"),
  };

  const RANK_MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

  init();

  function init() {
    loadSeasonList();

    els.modalClose.addEventListener("click", closeModal);
    els.modal.addEventListener("click", (e) => {
      if (e.target === els.modal) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.modal.classList.contains("hidden"))
        closeModal();
    });
    window.addEventListener("popstate", handleUrlState);
  }

  // ---------------------------------------------------------
  // Season list
  // ---------------------------------------------------------
  async function loadSeasonList() {
    showOnly("loading");
    try {
      const data = await fetchSeasonList();
      const seasons = Array.isArray(data.seasons) ? data.seasons : [];

      if (seasons.length === 0) {
        showOnly("empty");
        return;
      }

      seasons.sort((a, b) => new Date(b.ended_at) - new Date(a.ended_at));

      renderSeasonGrid(seasons);
      showOnly("grid");

      handleUrlState();
    } catch (err) {
      console.error(err);
      els.errorMsg.textContent =
        "Could not load the season archive. Please try again later.";
      showOnly("error");
    }
  }

  function showOnly(which) {
    els.loading.classList.toggle("hidden", which !== "loading");
    els.empty.classList.toggle("hidden", which !== "empty");
    els.error.classList.toggle("hidden", which !== "error");
    els.grid.classList.toggle("hidden", which !== "grid");
  }

  function renderSeasonGrid(seasons) {
    els.grid.innerHTML = seasons.map(seasonCardHTML).join("");

    els.grid.querySelectorAll("[data-season-id]").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.getAttribute("data-season-id");
        navigateToSeason(id);
      });
    });
  }

  function seasonCardHTML(season) {
    const monthLabel = formatSeasonId(season.id);
    const endLabel = `Ended ${formatEndDate(season.ended_at)}`;
    const initial = (season.season_champion_name || "?")
      .trim()
      .charAt(0)
      .toUpperCase();

    return `
      <article class="season-card" data-season-id="${escapeAttr(season.id)}">
        <div class="season-card-month">${monthLabel}</div>

        <div class="season-champion-row">
          <div class="mini-avatar-wrapper">
            <span class="crown-badge">👑</span>
            <div class="mini-avatar">${initial}</div>
          </div>
          <div class="champion-meta">
            <div class="name">${escapeHtml(season.season_champion_name || "Unknown")}</div>
            <div class="tag">${escapeHtml(season.season_champion_tag || "")}</div>
          </div>
        </div>

        <div class="season-stats-row">
          <div class="season-trophies">${trophyCountHTML(season.season_champion_trophies)}</div>
          <div class="season-end-date">${endLabel}</div>
        </div>

        <button class="view-standings-btn" type="button">View Final Standings →</button>
      </article>
    `;
  }

  // ---------------------------------------------------------
  // Season detail (modal)
  // ---------------------------------------------------------
  function navigateToSeason(id) {
    const url = new URL(window.location.href);
    url.searchParams.set("id", id);
    history.pushState({ seasonId: id }, "", url);
    openSeasonModal(id);
  }

  function handleUrlState() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) {
      openSeasonModal(id);
    } else {
      closeModal(false);
    }
  }

  async function openSeasonModal(id) {
    els.modal.classList.remove("hidden");
    els.modal.setAttribute("aria-hidden", "false");
    els.modalContent.classList.add("hidden");
    els.modalLoading.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    try {
      const data = await fetchSeasonDetail(id);
      if (!data.season) throw new Error("Season not found");

      renderSeasonDetail(data.season);
      els.modalLoading.classList.add("hidden");
      els.modalContent.classList.remove("hidden");
    } catch (err) {
      console.error(err);
      els.modalLoading.classList.add("hidden");
      els.modalContent.classList.remove("hidden");
      els.standingsBody.innerHTML = `
        <tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 24px;">
          Could not load this season's standings.
        </td></tr>`;
    }
  }

  function closeModal(updateUrl = true) {
    els.modal.classList.add("hidden");
    els.modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.delete("id");
      history.pushState({}, "", url);
    }
  }

  function renderSeasonDetail(season) {
    els.modalSeasonId.textContent = `Season ${season.id}`;
    els.championName.textContent = season.season_champion_name || "Unknown";
    els.championTag.textContent = season.season_champion_tag || "";
    els.championTrophies.textContent = formatNumber(
      season.season_champion_trophies,
    );
    els.modalEndDate.textContent = `Ended ${formatEndDate(season.ended_at)}`;

    const top10 = Array.isArray(season.final_top_10) ? season.final_top_10 : [];
    els.standingsBody.innerHTML =
      top10.map(standingsRowHTML).join("") ||
      `<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 20px;">No standings recorded.</td></tr>`;
  }

  function standingsRowHTML(entry) {
    const medal = RANK_MEDALS[entry.rank] || "";
    const rankClass = entry.rank <= 3 ? `rank-${entry.rank}` : "";

    return `
      <tr>
        <td><span class="rank-badge ${rankClass}">${medal} ${entry.rank}</span></td>
        <td>
          <div class="player-cell">
            <span class="p-name">${escapeHtml(entry.name || "Unknown")}</span>
            <span class="p-tag">${escapeHtml(entry.tag || "")}</span>
          </div>
        </td>
        <td class="trophy-cell">${trophyCountHTML(entry.trophies)}</td>
        <td class="clan-cell">${escapeHtml(entry.clan || "—")}</td>
        <td class="deck-cell">${deckIconsHTML(entry.deck)}</td>
      </tr>
    `;
  }

  function deckIconsHTML(deck) {
    if (!Array.isArray(deck) || deck.length === 0) {
      return '<span class="deck-empty">—</span>';
    }
    return `<div class="deck-icons">${deck.map(cloneIconHTML).join("")}</div>`;
  }

  function cloneIconHTML(clone) {
    const displayName = clone.displayName || "Unknown";
    const fileName = displayName.toLowerCase().replace(/ /g, "_");
    const imgSrc = `/assets/clones/${fileName}.png`;
    const firstLetter = displayName.charAt(0).toUpperCase();
    const color = colorFromString(displayName);
    const level = Number(clone.level);
    const levelBadge =
      Number.isFinite(level) && level > 0
        ? `<span class="clone-level">${level}</span>`
        : "";
    const title = levelBadge ? `${displayName} (Lv.${level})` : displayName;

    return `
      <div class="clone-icon" style="--clone-color: ${color}" title="${escapeAttr(title)}">
        <img src="${imgSrc}" alt="${escapeAttr(displayName)}" width="26" height="26" loading="lazy" decoding="async"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <span class="clone-fallback" style="display:none;">${firstLetter}</span>
        ${levelBadge}
      </div>
    `;
  }

  // ---------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------
  async function fetchSeasonList() {
    const res = await fetch("/api/seasons");
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
  }

  async function fetchSeasonDetail(id) {
    const res = await fetch(`/api/seasons?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
  }

  function trophyCountHTML(value) {
    return `<img class="archive-trophy-icon" src="/assets/icons/trophiestotal.png" alt="" aria-hidden="true" width="18" height="16" loading="lazy" decoding="async"> ${formatNumber(value)}`;
  }

  function formatSeasonId(id) {
    // "2026-09" -> "September 2026"
    const [year, month] = String(id).split("-");
    if (!year || !month) return id;
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleString("default", { month: "long", year: "numeric" });
  }

  // Returns just the formatted date, e.g. "Sep 28, 2026" — NO "Ended" prefix.
  // Callers are responsible for prepending "Ended " where needed.
  function formatEndDate(isoString) {
    if (!isoString) return "—";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatNumber(n) {
    if (n === null || n === undefined) return "0";
    return Number(n).toLocaleString("en-US");
  }

  function colorFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 42%)`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }
})();
