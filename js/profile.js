import {
  fetchPlayerProfile,
  fetchBattleHistory,
  fetchTrophyHistory,
  fetchLeaderboard,
} from "./api.js";
import { CLONE_META } from "./clone-meta.js";
import { showNotification } from "./notifications.js";

let trophyChartInstance = null;
let allBattles = [];
let activeFilter = "all";

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const tag = urlParams.get("tag");

  if (!tag) {
    window.location.href = "index.html";
    return;
  }

  initProfilePage(tag);
});

async function initProfilePage(tag) {
  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("error-state");
  const profileContent = document.getElementById("profile-content");

  showNotification("Loading profile...", "info");

  async function fetchRankData(tag) {
    const cacheKey = `rank1_${tag}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (
      cachedData &&
      Date.now() - JSON.parse(cachedData).timestamp < 5 * 60 * 1000
    ) {
      return JSON.parse(cachedData).data;
    }

    try {
      const response = await fetch(`/api/rank1?tag=${encodeURIComponent(tag)}`);
      if (!response.ok) throw new Error("API Error");

      const data = await response.json();
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ timestamp: Date.now(), data }),
      );
      return data;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function determineTier(count) {
    if (count === 0) return { tier: null }; // Hide case
    if (count >= 20) return { tier: "mythic", icon: "👑", label: "Mythic" };
    if (count >= 10) return { tier: "immortal", icon: "💎", label: "Immortal" };
    if (count >= 5) return { tier: "legend", icon: "🥇", label: "Legend" };
    if (count >= 3) return { tier: "warlord", icon: "🥈", label: "Warlord" };
    if (count >= 1) return { tier: "champion", icon: "🥉", label: "Champion" };
  }

  function renderRank1Badge(data) {
    const badgeEl = document.getElementById("rank1-badge");
    if (!data || data.count === 0) {
      badgeEl.style.display = "none"; // Hide badge
      return;
    }

    const { count, seasons } = data;
    const { tier, icon, label } = determineTier(count);

    if (tier) {
      badgeEl.className = `rank1-badge tier-${tier}`;
      badgeEl.querySelector(".rank1-icon").textContent = icon;
      badgeEl.querySelector(".rank1-label").textContent =
        `${label} · ${count}×`;

      // Tooltip
      const tooltipTitle = `${icon} ${label} — ${count}× #1 Finishes`;
      badgeEl.querySelector(".rank1-tooltip-title").textContent = tooltipTitle;

      const seasonsList = badgeEl.querySelector(".rank1-seasons");
      seasonsList.innerHTML = "";
      const recentSeasons = seasons.slice(0, 5);
      recentSeasons.forEach((season) => {
        const seasonItem = document.createElement("li");
        seasonItem.textContent = `Season ${season.season} — ${season.trophies} 🏆`;
        seasonsList.appendChild(seasonItem);
      });

      if (seasons.length > 5) {
        const moreItem = document.createElement("li");
        moreItem.textContent = `+${seasons.length - 5} more`;
        seasonsList.appendChild(moreItem);
      }

      badgeEl.style.display = "flex"; // Show badge
    }
  }

  try {
    const profile = await fetchPlayerProfile(tag);
    renderProfile(profile);

    const rankData = await fetchRankData(tag);
    renderRank1Badge(rankData);

    loadingState.classList.add("hidden");
    profileContent.classList.remove("hidden");
    showNotification("Player found!", "success");
  } catch (err) {
    loadingState.classList.add("hidden");
    errorState.classList.remove("hidden");

    if (err.message === "RATE_LIMIT") {
      showNotification(
        "Rate limit exceeded. Try again in a moment.",
        "warning",
      );
    } else {
      showNotification("Player not found", "error");
    }
    return;
  }

  loadBattleHistory(tag);

  loadTrophyChart(tag);

  loadGlobalRank(tag);

  loadSeasonHistory(tag);
}

async function loadGlobalRank(tag) {
  const rankEl = document.getElementById("stat-rank");
  if (!rankEl) return;

  try {
    const leaderboard = await fetchLeaderboard("", 500);
    const entry = leaderboard.find(
      (p) => p.tag?.toUpperCase() === tag.toUpperCase(),
    );

    if (entry && entry.rank) {
      rankEl.textContent = `#${entry.rank}`;
    } else {
      rankEl.textContent = "Unranked";
    }
  } catch (err) {
    console.warn("Global rank lookup failed", err);
    rankEl.textContent = "Unranked";
  }
}

function renderProfile(data) {
  const avatarEl = document.querySelector(".player-avatar");
  if (avatarEl) {
    avatarEl.innerHTML = `<img src="assets/king/King_01_blue.png" alt="King" />`;
  }

  document.getElementById("player-name").textContent = data.name || "Unknown";
  document.getElementById("player-tag").textContent = data.tag || "";
  document.getElementById("stat-trophies").textContent =
    data.trophies?.toLocaleString() || 0;
  document.getElementById("stat-rank").textContent = data.rank
    ? `#${data.rank}`
    : "Unranked";

  document.getElementById("stat-best-rank").textContent = data.bestSeasonRank
    ? `#${data.bestSeasonRank}`
    : "N/A";

  const wins = data.recentWins || data.wins || 0;
  const losses = data.recentLosses || data.losses || 0;
  const total = wins + losses;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;

  document.getElementById("stat-win-rate").textContent = `${winRate}%`;
  document.getElementById("stat-wl").textContent = `${wins} / ${losses}`;
  document.getElementById("stat-level").textContent =
    data.expLevel || data.level || 1;
  document.getElementById("stat-tribe").textContent = data.clan?.name || "None";

  const copyBtn = document.getElementById("copy-tag-btn");
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(data.tag).then(() => {
      showNotification("Copied to clipboard!", "success");
    });
  });

  const recapBtn = document.getElementById("season-recap-btn");
  if (recapBtn) {
    recapBtn.href = `season.html?tag=${encodeURIComponent(data.tag)}`;
  }
}

async function loadBattleHistory(tag) {
  const loadingEl = document.getElementById("battles-loading");
  const errorEl = document.getElementById("battles-error");
  const container = document.getElementById("battles-list");

  try {
    const battles = await fetchBattleHistory(tag, 30);
    loadingEl.classList.add("hidden");

    if (!battles || battles.length === 0) {
      errorEl.classList.remove("hidden");
      return;
    }

    allBattles = battles;
    setupBattleFilter();
    renderBattleList();
  } catch (err) {
    loadingEl.classList.add("hidden");
    errorEl.classList.remove("hidden");
  }
}

function setupBattleFilter() {
  const filterBar = document.getElementById("battle-filter");
  if (!filterBar) return;

  filterBar.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBar
        .querySelectorAll(".filter-btn")
        .forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      activeFilter = btn.dataset.filter;
      renderBattleList();
    });
  });
}

function renderBattleList() {
  const container = document.getElementById("battles-list");
  if (!container) return;

  const filtered = allBattles.filter((b) => {
    if (activeFilter === "all") return true;
    const is2v2 = b.teamSize === 2 || b.mode === "2v2";
    return activeFilter === "2v2" ? is2v2 : !is2v2;
  });

  container.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "battles-empty";
    empty.textContent =
      activeFilter === "2v2"
        ? "No 2v2 battles found."
        : "No 1v1 battles found.";
    container.appendChild(empty);
    return;
  }

  filtered.forEach((battle) => {
    container.appendChild(createBattleCard(battle));
  });
}

/* ============================================================
   CLONE RESOLUTION (shared with season page)
   ============================================================ */

function resolveCloneMeta(cardName) {
  const key = String(cardName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return (
    Object.values(CLONE_META).find(
      (m) =>
        m.file &&
        m.file
          .toLowerCase()
          .replace(/\.png$/, "")
          .replace(/[^a-z0-9]/g, "") === key,
    ) || null
  );
}

function resolveCloneIcon(cardName) {
  const meta = resolveCloneMeta(cardName);
  if (meta?.file) return `assets/clones/${meta.file}`;

  const key = String(cardName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `assets/clones/${key}.png`;
}

function resolveCloneByUnit(unit) {
  // Prefer the numeric unit id — it maps directly to CLONE_META keys
  if (unit.id != null && CLONE_META[unit.id]) {
    return CLONE_META[unit.id];
  }
  return resolveCloneMeta(unit.name);
}

function resolveCloneIconByUnit(unit) {
  const meta = resolveCloneByUnit(unit);
  if (meta?.file) return `assets/clones/${meta.file}`;
  return resolveCloneIcon(unit.name);
}

/* ============================================================
   BATTLE CARD (season-style, compact)
   ============================================================ */

function buildTeamSegment(side, team, opts = {}) {
  const {
    showDeck = true,
    showTrophies = true,
    showDelta = true,
    showClan = true,
  } = opts;

  const seg = document.createElement("div");
  seg.className = `battle-team ${side}`;

  // --- Player info ---
  const info = document.createElement("div");
  info.className = "battle-team-info";

  const nameRow = document.createElement("div");
  nameRow.className = "battle-player-name-row";

  const name = document.createElement("a");
  name.className = "battle-player-name";
  name.href = "#";
  name.textContent = team.name || "Unknown King";

  const pro = document.createElement("span");
  pro.className = "battle-pro-label";
  pro.textContent = "PRO";

  nameRow.appendChild(name);
  nameRow.appendChild(pro);

  info.appendChild(nameRow);

  if (showClan) {
    const sub = document.createElement("div");
    sub.className = "battle-player-sub";

    const clan = document.createElement("a");
    clan.className = "battle-player-clan";
    clan.href = "#";
    clan.textContent = team.clan || "No Clan";

    const rank = document.createElement("span");
    rank.className = "battle-player-rank";
    rank.textContent = team.rank ? `Rank #${team.rank}` : "";

    sub.appendChild(clan);
    sub.appendChild(rank);

    info.appendChild(sub);
  }

  // Render when there is a trophy count OR a non-zero delta (the API omits
  // the opponent's trophy count but still reports their trophyChange).
  if (
    showTrophies &&
    (team.trophies != null || (showDelta && team.trophyDelta))
  ) {
    const trophies = document.createElement("div");
    trophies.className = "battle-trophies";

    if (team.trophies != null) {
      const trophyIcon = document.createElement("img");
      trophyIcon.className = "battle-trophy-icon";
      trophyIcon.src = "assets/icons/trophiestotal.png";
      trophyIcon.alt = "";
      trophyIcon.loading = "lazy";
      trophyIcon.decoding = "async";
      trophyIcon.width = 18;
      trophyIcon.height = 16;

      const trophyVal = document.createElement("span");
      trophyVal.className = "battle-trophy-value";
      trophyVal.textContent = team.trophies.toLocaleString();

      trophies.appendChild(trophyIcon);
      trophies.appendChild(trophyVal);
    }

    if (showDelta) {
      const deltaVal = team.trophyDelta || 0;
      if (deltaVal !== 0) {
        const delta = document.createElement("span");
        delta.className = `battle-trophy-delta ${deltaVal >= 0 ? "is-gain" : "is-loss"}`;
        delta.textContent = `${deltaVal >= 0 ? "+" : ""}${deltaVal}`;
        trophies.appendChild(delta);
      }
    }

    info.appendChild(trophies);
  }

  seg.appendChild(info);

  // --- Deck (4x2 grid, no rarity tint) ---
  // Only render when the API actually returned deck cards (survival battles
  // come back with units: null, so there is nothing to show).
  if (showDeck && Array.isArray(team.deck) && team.deck.length > 0) {
    const deck = document.createElement("div");
    deck.className = "battle-deck";

    team.deck.forEach((card) => {
      const cardName = typeof card === "string" ? card : card.name || "Clone";

      const slot = document.createElement("div");
      slot.className = "battle-deck-slot";

      const img = document.createElement("img");
      img.className = "battle-deck-img";
      img.alt = cardName;
      img.loading = "lazy";
      img.decoding = "async";
      img.src = resolveCloneIconByUnit(card);
      img.onerror = () => {
        img.style.display = "none";
        slot.classList.add("is-fallback");
        slot.dataset.fallback = cardName.charAt(0).toUpperCase();
      };

      slot.appendChild(img);

      if (card && typeof card === "object" && card.level != null) {
        const level = document.createElement("span");
        level.className = "battle-deck-level";
        level.textContent = `Lv ${card.level}`;
        slot.appendChild(level);
      }
      deck.appendChild(slot);
    });

    seg.appendChild(deck);
  }

  return seg;
}

function createBattleCard(battle) {
  const resultValue = (battle.result || "").toLowerCase();
  const isWin = resultValue === "win";
  const isDraw = resultValue === "draw" || resultValue === "tie";

  // Map raw mode to a friendly label. "pvp" + teamSize 1 = ranked (trophies
  // at stake), "survival" = casual (no trophies gained/lost), teamSize 2 = 2v2.
  const rawMode = (battle.mode || "").toLowerCase();
  const is2v2 = battle.teamSize === 2 || rawMode === "2v2";
  const isSurvival = rawMode === "survival";
  const modeLabel = is2v2 ? "2v2" : isSurvival ? "Survival" : "Ranked";
  const modeClass = is2v2 ? "is-2v2" : isSurvival ? "is-survival" : "is-ranked";

  const card = document.createElement("div");
  card.className = `battle-card ${isWin ? "is-win" : isDraw ? "is-draw" : "is-loss"}`;

  // --- Header ---
  const header = document.createElement("div");
  header.className = "battle-card-header";

  const ribbon = document.createElement("div");
  ribbon.className = `battle-ribbon ${isWin ? "win" : isDraw ? "draw" : "loss"}`;
  ribbon.textContent = isWin ? "Victory" : isDraw ? "Draw" : "Defeat";

  const result = document.createElement("div");
  result.className = "battle-result";

  const mode = document.createElement("h4");
  mode.className = `battle-mode ${modeClass}`;
  mode.textContent = modeLabel;

  const score = document.createElement("div");
  score.className = "battle-score";

  const teamCrowns = battle.teamCrowns ?? (isWin ? 2 : 0);
  const oppCrowns = battle.opponentCrowns ?? (isWin ? 1 : 2);

  const crownBlue = document.createElement("span");
  crownBlue.className = "battle-crown battle-crown--blue";
  const crownBlueImage = document.createElement("img");
  crownBlueImage.src = "assets/cog.png";
  crownBlueImage.alt = "";
  crownBlue.appendChild(crownBlueImage);

  const scoreText = document.createElement("span");
  scoreText.className = "battle-score-text";
  scoreText.textContent = `${teamCrowns} - ${oppCrowns}`;

  const crownRed = document.createElement("span");
  crownRed.className = "battle-crown battle-crown--red";
  const crownRedImage = document.createElement("img");
  crownRedImage.src = "assets/cog.png";
  crownRedImage.alt = "";
  crownRed.appendChild(crownRedImage);

  score.appendChild(crownBlue);
  score.appendChild(scoreText);
  score.appendChild(crownRed);

  result.appendChild(mode);
  result.appendChild(score);

  const vsBadge = document.createElement("div");
  vsBadge.className = "battle-vs";
  vsBadge.textContent = "VS";

  header.appendChild(ribbon);
  header.appendChild(result);
  header.appendChild(vsBadge);

  // --- Emote decorations (win/loss themed) ---
  const winEmote = document.createElement("img");
  winEmote.className = "battle-emote battle-emote--win";
  winEmote.src = isWin
    ? "assets/emotes/king-celebration.png"
    : "assets/emotes/king-sad.png";
  winEmote.alt = "";
  winEmote.loading = "lazy";

  const lossEmote = document.createElement("img");
  lossEmote.className = "battle-emote battle-emote--loss";
  lossEmote.src = isWin
    ? "assets/emotes/king-omg-legend.png"
    : "assets/emotes/king-crying.png";
  lossEmote.alt = "";
  lossEmote.loading = "lazy";

  card.appendChild(winEmote);
  card.appendChild(lossEmote);

  // --- Teams ---
  const teams = document.createElement("div");
  teams.className = "battle-teams";

  const playerTeam = battle.player || {
    name: "You",
    deck: battle.deck || [],
  };
  const opponentTeam = battle.opponent || { name: "Enemy King" };

  if (is2v2) {
    // 2v2: names only — no decks, no trophies, no clan.
    teams.appendChild(
      buildTeamSegment("team", playerTeam, {
        showDeck: false,
        showTrophies: false,
        showClan: false,
      }),
    );
    teams.appendChild(
      buildTeamSegment("opponent", opponentTeam, {
        showDeck: false,
        showTrophies: false,
        showClan: false,
      }),
    );
  } else if (isSurvival) {
    // Survival: decks + clan, no trophies (nothing at stake).
    teams.appendChild(
      buildTeamSegment("team", playerTeam, {
        showDeck: true,
        showTrophies: false,
        showClan: true,
      }),
    );
    teams.appendChild(
      buildTeamSegment("opponent", opponentTeam, {
        showDeck: true,
        showTrophies: false,
        showClan: true,
      }),
    );
  } else {
    // Ranked: full info — trophies + delta, decks, clan.
    teams.appendChild(
      buildTeamSegment("team", playerTeam, {
        showDeck: true,
        showTrophies: true,
        showDelta: true,
        showClan: true,
      }),
    );
    teams.appendChild(
      buildTeamSegment("opponent", opponentTeam, {
        showDeck: true,
        showTrophies: true,
        showDelta: true,
        showClan: true,
      }),
    );
  }

  // --- Footer ---
  const footer = document.createElement("div");
  footer.className = "battle-card-footer";

  const meta = document.createElement("div");
  meta.className = "battle-meta";

  const duration = document.createElement("span");
  duration.className = "battle-duration";
  duration.textContent = battle.duration || "--";

  const date = document.createElement("span");
  date.className = "battle-date";
  date.textContent = getRelativeTime(battle.timestamp);

  meta.appendChild(duration);
  meta.appendChild(date);

  footer.appendChild(meta);

  card.appendChild(header);
  card.appendChild(teams);
  card.appendChild(footer);

  return card;
}

async function loadTrophyChart(tag) {
  const loadingEl = document.getElementById("chart-loading");
  const errorEl = document.getElementById("chart-error");
  const container = document.getElementById("chart-container");

  try {
    const history = await fetchTrophyHistory(tag);
    loadingEl.classList.add("hidden");

    if (!history || !history.dates || history.dates.length === 0) {
      errorEl.classList.remove("hidden");
      return;
    }

    container.classList.remove("hidden");
    renderChart(history.dates, history.trophies);
  } catch (err) {
    loadingEl.classList.add("hidden");
    errorEl.classList.remove("hidden");
  }
}

function formatChartLabel(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function renderChart(dates, trophies) {
  const ctx = document.getElementById("trophyChart").getContext("2d");

  if (trophyChartInstance) {
    trophyChartInstance.destroy();
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, "rgba(201, 136, 31, 0.35)");
  gradient.addColorStop(0.55, "rgba(201, 136, 31, 0.12)");
  gradient.addColorStop(1, "rgba(201, 136, 31, 0.02)");

  const first = trophies[0] ?? 0;
  const last = trophies[trophies.length - 1] ?? 0;
  const net = last - first;
  const best = Math.max(...trophies);
  const bestIdx = trophies.indexOf(best);

  trophyChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates.map(formatChartLabel),
      datasets: [
        {
          label: "Trophies",
          data: trophies,
          borderColor: "#c9881f",
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: "#fffaf0",
          pointBorderColor: "#c9881f",
          pointBorderWidth: 2,
          pointHitRadius: 12,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#2c2114",
          titleColor: "#ffe9b8",
          bodyColor: "#fffaf0",
          borderColor: "#b8923f",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            label: (item) => {
              const val = item.parsed.y;
              const prev = trophies[item.dataIndex - 1];
              let delta = "";
              if (prev != null) {
                const d = val - prev;
                delta = d >= 0 ? `  ▲ +${d}` : `  ▼ ${d}`;
              }
              return `Trophies: ${val.toLocaleString()}${delta}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#7c6a4f",
            maxTicksLimit: 8,
            maxRotation: 0,
            autoSkip: true,
          },
          grid: { color: "rgba(184, 146, 63, 0.12)" },
        },
        y: {
          ticks: { color: "#7c6a4f" },
          grid: { color: "rgba(184, 146, 63, 0.12)" },
        },
      },
    },
  });

  // Summary strip above the chart
  const summary = document.getElementById("chart-summary");
  if (summary) {
    const netClass = net >= 0 ? "is-gain" : "is-loss";
    summary.innerHTML = `
      <div class="chart-summary-item">
        <span class="chart-summary-label">Net</span>
        <span class="chart-summary-value ${netClass}">${net >= 0 ? "+" : ""}${net.toLocaleString()}</span>
      </div>
      <div class="chart-summary-item">
        <span class="chart-summary-label">Peak</span>
        <span class="chart-summary-value">${best.toLocaleString()}</span>
      </div>
      <div class="chart-summary-item">
        <span class="chart-summary-label">Current</span>
        <span class="chart-summary-value">${last.toLocaleString()}</span>
      </div>
    `;
  }
}

function getRelativeTime(timestamp) {
  if (!timestamp) return "Recently";
  const elapsed = Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 1000,
  );

  if (elapsed < 60) return "Just now";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h ago`;
  return `${Math.floor(elapsed / 86400)}d ago`;
}

async function loadSeasonHistory(tag) {
  const section = document.getElementById("season-history-section");
  const loadingEl = document.getElementById("season-history-loading");
  const listEl = document.getElementById("season-history-list");
  const statsEl = document.getElementById("season-history-stats");

  if (!section || !listEl || !statsEl) return;

  const cacheKey = `season_history_${tag}`;
  let data = null;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
        data = parsed.data;
      }
    }
  } catch {}

  if (!data) {
    section.classList.remove("hidden");
    loadingEl.classList.remove("hidden");
    listEl.innerHTML = "";
    statsEl.innerHTML = "";

    try {
      const response = await fetch(
        `/api/season-history?tag=${encodeURIComponent(tag)}`,
      );
      if (!response.ok) throw new Error("API Error");

      data = await response.json();
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ timestamp: Date.now(), data }),
      );
    } catch (err) {
      console.error("season-history fetch failed:", err);
      loadingEl.classList.add("hidden");
      section.classList.add("hidden");
      return;
    }
  }

  loadingEl.classList.add("hidden");

  if (!data || !data.totalSeasons || !Array.isArray(data.history)) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  renderSeasonHistory(data, listEl, statsEl);
}

function renderSeasonHistory(data, listEl, statsEl) {
  const { totalSeasons = 0, championCount = 0, bestRank, history = [] } = data;

  statsEl.innerHTML = "";

  const statDefs = [
    { label: "Seasons", value: totalSeasons },
    { label: "Championships", value: championCount },
    { label: "Best Rank", value: bestRank ? `#${bestRank}` : "—" },
  ];

  statDefs.forEach(({ label, value }) => {
    const pill = document.createElement("span");
    pill.className = "season-stat";
    pill.innerHTML = `${label}: <strong>${value}</strong>`;
    statsEl.appendChild(pill);
  });

  listEl.innerHTML = "";

  history.forEach((row) => {
    const link = document.createElement("a");
    link.className = `season-history-row${row.isChampion ? " champion" : ""}`;
    link.href = `season-archive.html?id=${encodeURIComponent(row.season)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const seasonEl = document.createElement("div");
    seasonEl.className = "season-history-season";
    if (row.isChampion) {
      const crown = document.createElement("span");
      crown.className = "season-crown";
      crown.textContent = "👑";
      crown.setAttribute("aria-hidden", "true");
      seasonEl.appendChild(crown);
    }
    const seasonText = document.createElement("span");
    seasonText.textContent = row.season;
    seasonEl.appendChild(seasonText);

    const rankEl = document.createElement("div");
    rankEl.className = "season-history-rank";
    const medal =
      row.rank === 1
        ? "🥇"
        : row.rank === 2
          ? "🥈"
          : row.rank === 3
            ? "🥉"
            : "";
    rankEl.textContent = medal
      ? `${medal} Rank #${row.rank}`
      : `Rank #${row.rank}`;

    // Trophies
    const trophiesEl = document.createElement("div");
    trophiesEl.className = "season-history-trophies";
    trophiesEl.textContent = `${(row.trophies || 0).toLocaleString()} 🏆`;

    link.appendChild(seasonEl);
    link.appendChild(rankEl);
    link.appendChild(trophiesEl);

    listEl.appendChild(link);
  });
}
