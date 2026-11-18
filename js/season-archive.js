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
  const CLONE_FILE_MAP = {
    Arrows: "arrows",
    Ballon: "balloon",
    Balloon: "balloon",
    "Anti-Gravity": "antigravity",
    "Big Bouncy Bomb": "bigbouncybomb",
    "Big Frost": "bigfrost",
    "Big Smith": "bigsmith",
    "Blast Bot": "blastbot",
    "Blast Fish": "blastfish",
    "Blast Grenade": "blastgrenade",
    "Blast Mine": "blastmine",
    "Blast Rocket": "blastrocket",
    "Bomb Birds": "bombbirds",
    "Bomb Drone": "bombdrone",
    "Bomb Fly": "bombfly",
    "Bomb Frog": "bombfrog",
    "Bomb Golem": "bombgolem",
    "Bomb Spider": "bombspider",
    "Bouncy Bomb": "bouncybomb",
    "Bouncy Doom": "fankit_bouncydoom_card",
    "Cluster Bomb": "clusterbomb",
    "Core Bomber": "corebomber",
    "Core Freezer": "corefreezer",
    "Core Lightning": "corelightning",
    "Core Tri Bomb": "coretribomb",
    "Doggo House": "doggohouse",
    "Doggo Horde": "doggohorde",
    Doggos: "doggos",
    "Fire Birds": "firebirds",
    Fireball: "fireball",
    "Floating Bomb": "floatingbomb",
    "Flying Barrel": "flyingbarrel",
    "Flying Doggos": "flyingdoggos",
    Icicle: "icicle",
    "Laser Bunnies": "laserbunnies",
    Lumberjackie: "lumberjackie",
    Magnet: "magnet",
    "Mind Tick": "mindtick",
    "Mini Bomb": "minibomb",
    Overseer: "overseer",
    "Plain Bomb": "plainbomb",
    "Puffer Bug": "pufferbug",
    "Radioactive Bomb": "radioactivebomb",
    "Replicant Saw": "replica_saw_card",
    Snatcher: "snatcher",
    Spiky: "spiky",
    "Spinning Saw": "spinningsaw",
    "Sticky Bomb": "stickybomb",
    "Striker Boy": "strikerboy",
    Tornado: "tornado",
    Wildfire: "wildfire",
    "Brawl Ball": "brawlball",
  };

  let allSeasons = [],
    listReady = false,
    detailToken = 0,
    detailController,
    activeId,
    returnFocus;
  const modalError = document.getElementById("modal-error");
  init();

  function init() {
    loadSeasonList();
    document
      .getElementById("archive-retry")
      .addEventListener("click", loadSeasonList);
    document
      .getElementById("modal-retry")
      .addEventListener("click", () => openSeasonModal(activeId));
    document
      .getElementById("archive-search")
      .addEventListener("input", renderFiltered);
    document
      .getElementById("archive-sort")
      .addEventListener("change", renderFiltered);

    els.modalClose.addEventListener("click", closeModal);
    els.modal.addEventListener("click", (e) => {
      if (e.target === els.modal) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !els.modal.classList.contains("hidden")) {
        const nodes = [
          ...els.modal.querySelectorAll(
            "button,a[href],input,select,[tabindex='0']",
          ),
        ].filter((node) => node.getClientRects().length);
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
      if (e.key === "Escape" && !els.modal.classList.contains("hidden"))
        closeModal();
    });
    window.addEventListener("popstate", handleUrlState);
  }

  // ---------------------------------------------------------
  // Season list
  // ---------------------------------------------------------
  async function loadSeasonList() {
    listReady = false;
    showOnly("loading");
    try {
      const data = await fetchSeasonList();
      if (!Array.isArray(data.seasons))
        throw new Error("Invalid archive response");
      const seasons = data.seasons.filter(
        (s) => s && typeof s === "object" && s.id != null,
      );
      allSeasons = seasons;
      listReady = true;
      document.getElementById("archive-count").textContent =
        seasons.length.toLocaleString();
      const champions = new Set(
        seasons
          .map((s) => s.season_champion_tag || s.season_champion_name)
          .filter(Boolean),
      );
      document.getElementById("champions-count").textContent =
        champions.size.toLocaleString();
      const scores = seasons
        .map((s) => numeric(s.season_champion_trophies))
        .filter((n) => n != null);
      document.getElementById("record-trophies").textContent = scores.length
        ? formatNumber(Math.max(...scores))
        : "—";

      if (seasons.length === 0) {
        showOnly("empty");
        document.getElementById("archive-results").textContent =
          "No archived seasons";
        handleUrlState();
        return;
      }

      seasons.sort((a, b) => new Date(b.ended_at) - new Date(a.ended_at));

      renderFiltered();

      handleUrlState();
    } catch (err) {
      console.error(err);
      els.errorMsg.textContent =
        "Could not load the season archive. Please try again later.";
      showOnly("error");
      document.getElementById("archive-results").textContent =
        "Archive unavailable";
    }
  }

  function showOnly(which) {
    els.loading.classList.toggle("hidden", which !== "loading");
    els.empty.classList.toggle("hidden", which !== "empty");
    els.error.classList.toggle("hidden", which !== "error");
    els.grid.classList.toggle("hidden", which !== "grid");
  }

  function renderFiltered() {
    if (!listReady || allSeasons.length === 0) return;
    const query = document
      .getElementById("archive-search")
      .value.trim()
      .toLowerCase();
    const sort = document.getElementById("archive-sort").value;
    const seasons = allSeasons.filter((s) =>
      [
        s.id,
        formatSeasonId(s.id),
        s.season_champion_name,
        s.season_champion_tag,
      ].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(query),
      ),
    );
    seasons.sort((a, b) =>
      sort === "trophies"
        ? (numeric(b.season_champion_trophies) ?? -1) -
          (numeric(a.season_champion_trophies) ?? -1)
        : (sort === "oldest" ? 1 : -1) * (sortTime(a) - sortTime(b)),
    );
    renderSeasonGrid(seasons);
    showOnly("grid");
    document.getElementById("archive-results").textContent =
      seasons.length + " seasons";
    if (!seasons.length) {
      const message = document.createElement("p");
      message.className = "state-container";
      message.textContent = "No matching seasons. Try another name or year.";
      els.grid.append(message);
    }
  }
  function sortTime(season) {
    const time = Date.parse(season.ended_at);
    return Number.isFinite(time)
      ? time
      : Date.parse(String(season.id) + "-01") || 0;
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
        <div class="season-card-month">${escapeHtml(monthLabel)}<span>FINAL RESULTS</span></div>

        <div class="season-champion-row">
          <div class="mini-avatar-wrapper">

            <div class="mini-avatar">${escapeHtml(initial)}</div>
          </div>
          <div class="champion-meta">
            <span class="champion-label">SEASON CHAMPION</span><div class="name">${escapeHtml(season.season_champion_name || "Unknown")}</div>
            <div class="tag">${escapeHtml(season.season_champion_tag || "")}</div>
          </div>
        </div>

        <div class="season-card-bottom"><div class="season-stats-row">
          <div class="season-trophies">${trophyCountHTML(season.season_champion_trophies)}</div>
          <div class="season-end-date">${endLabel}</div>
        </div>

        <button class="view-standings-btn" type="button" aria-label="View standings for ${escapeAttr(monthLabel)}">View final standings ↗</button></div>
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
    const token = ++detailToken;
    detailController?.abort();
    detailController = new AbortController();
    activeId = id;
    if (els.modal.classList.contains("hidden"))
      returnFocus = document.activeElement;
    els.modal.classList.remove("hidden");
    els.modal.setAttribute("aria-hidden", "false");
    els.modalContent.classList.add("hidden");
    modalError.classList.add("hidden");
    els.modalLoading.classList.remove("hidden");
    els.modalSeasonId.textContent = "Season " + id;
    els.modal.querySelector(".modal-panel").setAttribute("aria-busy", "true");
    document.body.style.overflow = "hidden";
    setBackgroundInert(true);
    els.modalClose.focus();
    try {
      const data = await fetchSeasonDetail(id, detailController.signal);
      if (token !== detailToken) return;
      if (!data.season || typeof data.season !== "object")
        throw new Error("Season not found");
      renderSeasonDetail(data.season);
      els.modalContent.classList.remove("hidden");
    } catch (err) {
      if (token !== detailToken) return;
      modalError.classList.remove("hidden");
    } finally {
      if (token === detailToken) {
        els.modalLoading.classList.add("hidden");
        els.modal
          .querySelector(".modal-panel")
          .setAttribute("aria-busy", "false");
      }
    }
  }
  function setBackgroundInert(value) {
    document
      .querySelectorAll(".site-header,main,.site-footer")
      .forEach((el) => (el.inert = value));
  }
  function closeModal(updateUrl = true) {
    const wasOpen = !els.modal.classList.contains("hidden");
    ++detailToken;
    detailController?.abort();
    els.modal.classList.add("hidden");
    els.modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    setBackgroundInert(false);
    if (wasOpen && returnFocus?.isConnected) returnFocus.focus();
    if (updateUrl && wasOpen) {
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
      top10
        .filter((entry) => entry && typeof entry === "object")
        .sort(
          (a, b) =>
            (numeric(a.rank) ?? Infinity) - (numeric(b.rank) ?? Infinity),
        )
        .map(standingsRowHTML)
        .join("") ||
      `<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 20px;">No standings recorded.</td></tr>`;
  }

  function standingsRowHTML(entry) {
    const medal = RANK_MEDALS[entry.rank] || "";
    const rank = numeric(entry.rank);
    const rankClass = [1, 2, 3].includes(rank) ? `rank-${rank}` : "";

    return `
      <tr>
        <td><span class="rank-badge ${rankClass}">${medal} ${escapeHtml(rank ?? "—")}</span></td>
        <td>
          <div class="player-cell">
            <a class="p-name" href="profile.html?tag=${encodeURIComponent(String(entry.tag || ""))}">${escapeHtml(entry.name || "Unknown")}</a>
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
    return `<div class="deck-icons">${deck
      .filter((clone) => clone && typeof clone === "object")
      .slice(0, 8)
      .map(cloneIconHTML)
      .join("")}</div>`;
  }

  function cloneIconHTML(clone) {
    const displayName = String(clone.displayName || clone.name || "Unknown");
    const fileName = getCloneFileName(displayName);
    const imgSrc = `/assets/clones/${fileName}.png`;
    const firstLetter = displayName.charAt(0).toUpperCase();
    const color = colorFromString(displayName);

    return `
      <div class="clone-icon" style="--clone-color: ${color}" title="${escapeAttr(displayName)}">
        <img src="${imgSrc}" alt="${escapeAttr(displayName)}" width="26" height="26" loading="lazy" decoding="async"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <span class="clone-fallback" style="display:none;">${escapeHtml(firstLetter)}</span>
      </div>
    `;
  }

  function getCloneFileName(displayName) {
    if (!displayName) return null;
    if (Object.hasOwn(CLONE_FILE_MAP, displayName)) {
      return CLONE_FILE_MAP[displayName];
    }
    return displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // ---------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------
  async function fetchSeasonList() {
    const res = await fetch("/api/seasons", {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
  }

  async function fetchSeasonDetail(id, signal) {
    const res = await fetch(`/api/seasons?id=${encodeURIComponent(id)}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
  }

  function trophyCountHTML(value) {
    return `<img class="archive-trophy-icon" src="/assets/icons/trophiestotal.png" alt="" aria-hidden="true" width="18" height="16" loading="lazy" decoding="async"> ${formatNumber(value)}`;
  }

  function formatSeasonId(id) {
    // "2026-09" -> "September 2026"
    const [year, month] = String(id).split("-");
    if (
      !/^\d{4}-\d{2}$/.test(String(id)) ||
      Number(month) < 1 ||
      Number(month) > 12
    )
      return String(id);
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

  function numeric(value) {
    if (value == null || value === "" || typeof value === "boolean")
      return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function formatNumber(n) {
    const value = numeric(n);
    return value == null ? "—" : Math.floor(value).toLocaleString("en-US");
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
