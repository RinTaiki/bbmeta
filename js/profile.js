import {
  fetchPlayerProfile,
  fetchBattleHistory,
  fetchLeaderboard,
} from "./api.js";
import { CLONE_META } from "./clone-meta.js";
import { showNotification } from "./notifications.js";

let trophyChartInstance = null;
let allBattles = [];
let activeFilter = "all";
const WIN_RATE_MODES = [
  { key: "1v1", label: "1v1 Ladder" },
  { key: "2v2", label: "2v2" },
  { key: "survival", label: "Survival" },
];
let winRateModes = null;
let activeWinRateMode = 0;

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const tag = urlParams.get("tag");

  if (!tag) {
    window.location.href = "index.html";
    return;
  }

  initProfilePage(tag);
  document
    .getElementById("win-rate-mode-toggle")
    ?.addEventListener("click", () => {
      activeWinRateMode = (activeWinRateMode + 1) % WIN_RATE_MODES.length;
      renderActiveWinRate();
    });
});

async function initProfilePage(tag) {
  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("error-state");
  const profileContent = document.getElementById("profile-content");

  showNotification("Loading profile...", "info");
  let battlesRequest;

  try {
    battlesRequest = fetchBattleHistory(tag, 30).catch((error) => {
      console.warn("Battle history unavailable", error);
      return [];
    });
    const profile = await fetchPlayerProfile(tag);

    if (!profile.name || profile.trophies == null) {
      const battles = await battlesRequest;
      const player = battles.find(
        (battle) => battle.player?.name && battle.player.name !== "You",
      )?.player;
      if (!profile.name && player?.name) profile.name = player.name;
      if (profile.trophies == null && player?.trophies != null) {
        profile.trophies = player.trophies;
      }
    }

    renderProfile(profile);

    const isLocal =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (!isLocal) {
      fetch("/api/track-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: profile.tag,
          rank: profile.rank || null,
          trophies: profile.trophies || null,
          exp_level: profile.expLevel || null,
        }),
      }).catch(() => {});
    }

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

  loadBattleHistory(tag, battlesRequest);

  loadTrophyChart(tag);

  loadGlobalRank(tag);

  loadSeasonHistory(tag);
  loadPlayerExtras(tag);
  checkSeasonRecapVisibility();
}

async function loadPlayerExtras(tag) {
  const cacheKey = `player_extras_${tag}`;
  let data = null;

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      data = cached.data;
    }
  } catch {}

  if (!data) {
    const encodedTag = encodeURIComponent(tag);
    const types = ["top10", "deck", "winrates"];
    const results = await Promise.allSettled(
      types.map(async (type) => {
        const response = await fetch(
          `/api/player-extras?type=${type}&tag=${encodedTag}`,
        );
        if (!response.ok) throw new Error(`Extras ${type}: ${response.status}`);
        return [type, await response.json()];
      }),
    );

    data = {};
    for (const result of results) {
      if (result.status === "rejected") {
        console.warn("Player extras unavailable", result.reason);
        continue;
      }
      const [type, value] = result.value;
      data[type] = value;
    }

    if (Object.keys(data).length > 0) {
      try {
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ timestamp: Date.now(), data }),
        );
      } catch {}
    }
  }

  if (data.top10) renderTop10Extras(data.top10);
  if (data.deck) renderFavoriteDeck(data.deck);
  if (data.winrates) renderModeWinRates(data.winrates);
}

function renderTop10Extras(data) {
  const rank1Badge = document.getElementById("rank1-badge");
  const badge = document.getElementById("top10-badge");
  const count = document.getElementById("top10-count");
  const title = document.getElementById("top10-tooltip-title");
  const seasonsList = document.getElementById("top10-seasons-list");
  const rank1Count = document.getElementById("rank1-count");
  const rank1TooltipTitle = document.getElementById("rank1-tooltip-title");
  const rank1SeasonsList = document.getElementById("rank1-seasons-list");
  const titleBadge = document.getElementById("achievement-title");
  const titleText = document.getElementById("achievement-title-text");
  const titleSweep = titleBadge?.querySelector(".profile-title-sweep");
  const titleEmbers = titleBadge?.querySelector(".profile-title-embers");
  const titleTooltip = document.getElementById("title-tooltip-title");
  const titleSeasonsList = document.getElementById("title-seasons-list");
  const achievementRow = document.getElementById("achievement-badges");
  if (
    !rank1Badge ||
    !badge ||
    !count ||
    !title ||
    !seasonsList ||
    !rank1Count ||
    !rank1TooltipTitle ||
    !rank1SeasonsList ||
    !titleBadge ||
    !titleText ||
    !titleSweep ||
    !titleEmbers ||
    !titleTooltip ||
    !titleSeasonsList
  )
    return;

  const seasons = Array.isArray(data.seasons) ? data.seasons : [];
  const top10Count = Number(data.top10Count) || 0;
  const champions = Number(data.championCount) || 0;
  const championSeasons = seasons.filter((season) => Number(season.rank) === 1);
  const titleTier =
    champions >= 20
      ? "MYTHIC"
      : champions >= 10
        ? "IMMORTAL"
        : champions >= 5
          ? "LEGEND"
          : champions >= 3
            ? "WARLORD"
            : champions > 0
              ? "CHAMPION"
              : "";

  rank1Count.textContent = `${champions}×`;
  rank1TooltipTitle.textContent = `${champions}× #1 Season Finishes`;
  rank1Badge.dataset.tooltipSeasons = championSeasons
    .map((season) => season.season)
    .join(", ");
  rank1Badge.setAttribute("aria-label", rank1TooltipTitle.textContent);
  rank1Badge.hidden = champions === 0;
  rank1SeasonsList.replaceChildren();
  appendSeasonItems(rank1SeasonsList, championSeasons, false);

  titleText.textContent = titleTier;
  titleSweep.textContent = titleTier;
  if (titleEmbers.childElementCount === 0) {
    for (let i = 0; i < 24; i++) {
      const ember = document.createElement("i");
      ember.style.setProperty("--x", `${(i * 43) % 101}%`);
      ember.style.setProperty("--delay", `${-(i * 0.37)}s`);
      ember.style.setProperty("--duration", `${3 + (i % 5) * 0.6}s`);
      ember.style.setProperty(
        "--drift",
        `${(i % 2 ? 1 : -1) * (12 + (i % 6) * 6)}px`,
      );
      ember.style.setProperty("--size", `${2 + (i % 4)}px`);
      titleEmbers.append(ember);
    }
  }
  titleTooltip.textContent = `${champions}× #1 Season Finishes`;
  titleBadge.dataset.tooltipSeasons = rank1Badge.dataset.tooltipSeasons;
  titleBadge.className = `achievement-title has-inferno-vfx tier-${titleTier.toLowerCase()}`;
  titleBadge.setAttribute(
    "aria-label",
    `${titleTier}: ${titleTooltip.textContent}`,
  );
  titleBadge.hidden = !titleTier;
  titleSeasonsList.replaceChildren();
  appendSeasonItems(titleSeasonsList, championSeasons, false);

  count.textContent = `${top10Count}×`;
  title.textContent = `${top10Count}× Top 10 Finishes`;
  badge.dataset.tooltipSeasons = seasons
    .map((season) => `${season.season} #${season.rank}`)
    .join(", ");
  badge.setAttribute("aria-label", title.textContent);
  seasonsList.replaceChildren();
  appendSeasonItems(seasonsList, seasons, true);
  badge.hidden = top10Count === 0;
  achievementRow.hidden = champions === 0 && top10Count === 0;
}

function appendSeasonItems(list, seasons, includeRank) {
  for (const season of seasons) {
    const item = document.createElement("li");
    item.textContent = includeRank
      ? `${season.season} — Rank #${season.rank}`
      : season.season;
    list.appendChild(item);
  }
}

function renderFavoriteDeck(data) {
  const section = document.getElementById("favorite-deck-block");
  const grid = document.getElementById("favorite-deck-grid");
  const meta = document.getElementById("favorite-deck-meta");
  if (!section || !grid || !meta) return;

  const deck = Array.isArray(data.deck) ? data.deck.slice(0, 8) : [];
  if (deck.length === 0) return;

  grid.replaceChildren();
  for (const unit of deck) {
    const name = unit.displayName || unit.name || "Clone";
    const slot = document.createElement("div");
    slot.className = "favorite-deck-slot";

    const image = document.createElement("img");
    image.className = "favorite-deck-img";
    image.alt = name;
    image.loading = "lazy";
    image.decoding = "async";
    image.src =
      name === "Sticky Doom"
        ? "assets/clones/fankit_stockydoom_card.png"
        : resolveCloneIconByUnit({ ...unit, name });
    image.addEventListener(
      "error",
      () => {
        image.remove();
        slot.classList.add("is-fallback");
        slot.dataset.fallback = name.charAt(0).toUpperCase();
      },
      { once: true },
    );
    slot.appendChild(image);
    grid.appendChild(slot);
  }

  const source = data.source === "current" ? "Current" : data.source || "";
  meta.textContent =
    data.matchCount > 0
      ? `${source} · ${data.matchCount}/${data.totalMatches}`
      : source;
  section.hidden = false;
}

function renderModeWinRates(data) {
  if (!data.modes) return;
  winRateModes = data.modes;
  renderActiveWinRate();
}

function renderActiveWinRate() {
  const mode = WIN_RATE_MODES[activeWinRateMode];
  const values = winRateModes?.[mode.key];
  const value = document.getElementById("stat-win-rate");
  const label = document.getElementById("win-rate-mode");
  const button = document.getElementById("win-rate-mode-toggle");
  const dots = document.getElementById("win-rate-dots");
  if (!value || !label || !button || !dots) return;

  const hasData = Number(values?.total) > 0 && values.winRate != null;
  value.textContent = hasData ? `${Number(values.winRate).toFixed(1)}%` : "—";
  label.textContent = mode.label;
  button.setAttribute(
    "aria-label",
    `Win rate: ${mode.label}. Activate to change mode.`,
  );
  dots.querySelectorAll("span").forEach((dot, index) => {
    dot.classList.toggle("is-active", index === activeWinRateMode);
  });
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
  document.title = (data.name || "Player") + " — BBmeta Profile";
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
  document.getElementById("stat-wl").textContent = `${wins} / ${losses}`;
  document.getElementById("stat-level").textContent =
    data.expLevel || data.level || 1;
  document.getElementById("stat-tribe").textContent = data.clan?.name || "None";

  const tagEl = document.getElementById("player-tag");
  const originalTag = data.tag || "";
  let copyResetTimer = null;

  const handleCopyTag = async () => {
    if (tagEl.dataset.copied === "true") return;

    try {
      await navigator.clipboard.writeText(originalTag);
      showNotification("Copied to clipboard!", "success");

      tagEl.dataset.copied = "true";
      tagEl.textContent = "Copied";
      tagEl.title = "Copied!";
      tagEl.classList.add("is-copied");

      clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        tagEl.textContent = originalTag;
        tagEl.title = "Click to copy";
        tagEl.classList.remove("is-copied");
        delete tagEl.dataset.copied;
      }, 1200);
    } catch (err) {
      console.error("Clipboard write failed:", err);
      showNotification("Couldn't copy - try manually", "error");
    }
  };

  tagEl.addEventListener("click", handleCopyTag);
  tagEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCopyTag();
    }
  });

  const recapBtn = document.getElementById("season-recap-btn");
  if (recapBtn) {
    recapBtn.href = `season.html?tag=${encodeURIComponent(data.tag)}`;
  }
}

async function loadBattleHistory(
  tag,
  battlesRequest = fetchBattleHistory(tag, 30),
) {
  const loadingEl = document.getElementById("battles-loading");
  const errorEl = document.getElementById("battles-error");
  const container = document.getElementById("battles-list");

  try {
    const battles = await battlesRequest;
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

  const cacheKey = `history_${tag}`;
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
    try {
      const response = await fetch(
        `/api/history?tag=${encodeURIComponent(tag)}&days=30`,
      );
      if (!response.ok) throw new Error("API Error");

      data = await response.json();
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ timestamp: Date.now(), data }),
      );
    } catch (err) {
      console.warn("Trophy history fetch failed:", err);
      loadingEl.classList.add("hidden");
      errorEl.textContent = "History unavailable.";
      errorEl.classList.remove("hidden");
      return;
    }
  }

  loadingEl.classList.add("hidden");

  const points = [
    ...new Map(
      (Array.isArray(data?.points) ? data.points : [])
        .filter(
          (p) =>
            p &&
            Number.isFinite(Date.parse(p.captured_at)) &&
            p.trophies != null &&
            p.trophies !== "" &&
            Number.isFinite(Number(p.trophies)) &&
            Number(p.trophies) >= 0,
        )
        .map((p) => [
          Date.parse(p.captured_at),
          { captured_at: p.captured_at, trophies: Number(p.trophies) },
        ]),
    ).values(),
  ].sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));

  if (points.length === 0) {
    errorEl.textContent = "No history data yet. Come back after a few hours.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (typeof Chart === "undefined") {
    errorEl.textContent = "The chart could not load. Refresh to try again.";
    errorEl.classList.remove("hidden");
    return;
  }
  const dates = points.map((p) => p.captured_at);
  const trophies = points.map((p) => p.trophies ?? 0);

  container.classList.remove("hidden");
  renderChart(dates, trophies);
}

function formatChartLabel(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function renderChart(dates, trophies) {
  const canvas = document.getElementById("trophyChart");
  const ctx = canvas.getContext("2d");
  trophyChartInstance?.destroy();
  const first = trophies[0],
    last = trophies.at(-1);
  const net = last - first,
    best = Math.max(...trophies),
    low = Math.min(...trophies);
  const padding = Math.max(30, Math.ceil((best - low) * 0.18));
  const timestamps = dates.map((date) => Date.parse(date));
  const single = timestamps.length === 1;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    `Trophy history: ${first.toLocaleString()} to ${last.toLocaleString()}, net ${net >= 0 ? "+" : ""}${net.toLocaleString()} trophies across ${dates.length} snapshots.`,
  );
  trophyChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Trophies",
          data: timestamps.map((x, i) => ({ x, y: trophies[i] })),
          borderColor: "#bb7d1b",
          borderWidth: 2.5,
          backgroundColor: (context) => {
            const area = context.chart.chartArea;
            if (!area) return "rgba(201,136,31,.08)";
            const gradient = context.chart.ctx.createLinearGradient(
              0,
              area.top,
              0,
              area.bottom,
            );
            gradient.addColorStop(0, "rgba(201,136,31,.24)");
            gradient.addColorStop(1, "rgba(201,136,31,0)");
            return gradient;
          },
          fill: "start",
          tension: 0.15,
          cubicInterpolationMode: "monotone",
          pointRadius: (context) =>
            context.dataIndex === trophies.length - 1 ? 4 : 0,
          pointHoverRadius: 6,
          pointHitRadius: 18,
          pointBackgroundColor: "#bb7d1b",
          pointBorderColor: "#fff8e9",
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 15, right: 12, bottom: 3, left: 0 } },
      interaction: { mode: "nearest", axis: "x", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#302014",
          titleColor: "#f5d28b",
          bodyColor: "#fff1da",
          padding: 12,
          cornerRadius: 9,
          displayColors: false,
          callbacks: {
            title: (items) =>
              items.length
                ? new Date(items[0].parsed.x).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "",
            label: (item) => `${item.parsed.y.toLocaleString()} trophies`,
            afterLabel: (item) => {
              const previous = trophies[item.dataIndex - 1];
              if (previous == null) return "First recorded snapshot";
              const change = item.parsed.y - previous;
              return `${change >= 0 ? "+" : ""}${change.toLocaleString()} since previous snapshot`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: single ? timestamps[0] - 43200000 : timestamps[0],
          max: single ? timestamps[0] + 43200000 : timestamps.at(-1),
          border: { display: false },
          grid: { display: false },
          ticks: {
            maxTicksLimit: 4,
            maxRotation: 0,
            padding: 10,
            color: "#977b54",
            font: { family: "Inter", size: 10 },
            callback: (value) => formatChartLabel(Number(value)),
          },
        },
        y: {
          min: Math.max(0, Math.floor((low - padding) / 10) * 10),
          max: Math.ceil((best + padding) / 10) * 10,
          border: { display: false },
          grid: { color: "rgba(121,89,45,.09)", drawTicks: false },
          ticks: {
            maxTicksLimit: 5,
            padding: 10,
            color: "#977b54",
            font: { family: "Inter", size: 10 },
            callback: (value) => Number(value).toLocaleString(),
          },
        },
      },
    },
  });
  document.getElementById("chart-summary").innerHTML = `
    <div class="chart-summary-item chart-current"><span class="chart-summary-label">Latest snapshot</span><strong class="chart-summary-value">${last.toLocaleString()}</strong></div>
    <div class="chart-summary-item"><span class="chart-summary-label">Net change</span><strong class="chart-summary-value ${net >= 0 ? "is-gain" : "is-loss"}">${net >= 0 ? "+" : ""}${net.toLocaleString()}</strong></div>
    <div class="chart-summary-item"><span class="chart-summary-label">Period peak</span><strong class="chart-summary-value">${best.toLocaleString()}</strong></div>`;
  let caption = document.getElementById("chart-caption");
  if (!caption) {
    caption = document.createElement("p");
    caption.id = "chart-caption";
    document.getElementById("chart-container").append(caption);
  }
  caption.textContent = single
    ? "One snapshot recorded · More visits will build your trophy trail."
    : `${formatChartLabel(dates[0])} – ${formatChartLabel(dates.at(-1))} · ${dates.length.toLocaleString()} recorded snapshots`;
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
  const {
    totalSeasons = 0,
    championCount = 0,
    bestRank,
    bestRankSource,
    history = [],
  } = data;

  statsEl.innerHTML = "";

  const statDefs = [
    { label: "Seasons", value: totalSeasons },
    { label: "Championships", value: championCount },
    {
      label:
        bestRankSource === "api"
          ? "Best Rank (all-time)"
          : "Best Rank (tracked)",
      value: bestRank ? `#${bestRank}` : "—",
    },
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

async function checkSeasonRecapVisibility() {
  const btn = document.getElementById("season-recap-btn");
  if (!btn) return;

  try {
    const res = await fetch("/api/seasons");
    if (!res.ok) return;

    const data = await res.json();
    const seasons = Array.isArray(data?.seasons) ? data.seasons : [];

    if (seasons.length === 0) {
      btn.style.display = "none";
      return;
    }

    const mostRecent = seasons[0];
    const endedAt = new Date(mostRecent.ended_at);
    if (isNaN(endedAt.getTime())) return;

    const daysSince = (Date.now() - endedAt.getTime()) / 86400000;

    // Keep the recap visible for 2 days after the season ends.
    if (daysSince > 2) {
      btn.style.display = "none";
    }
  } catch (err) {
    console.warn("Season recap visibility check failed:", err);
  }
}
