import { fetchPlayerProfile, fetchBattleHistory } from "./api.js";
import { CLONE_META } from "./clone-meta.js";
import { showNotification } from "./notifications.js";

/* ============================================================
   MOCK DATA – for preview only
   ============================================================ */

const profileMock = {
  name: "Clash King",
  tag: "#2808000",
  displayName: "Clash King",
  playerTag: "#2808000",
  rank: 42,
  globalRank: 42,
  leaderboardRank: 42,
  bestRank: 8,
  highestRank: 8,
  maxRank: 8,
  totalBattles: 187,
  battlesCount: 187,
  winRate: 63.2,
  wins: 118,
  losses: 69,
  firstPlaceFinishes: 5,
  firstCount: 5,
};

const battlesMock = [
  {
    result: "win",
    mode: "Ranked",
    duration: "12m 20s",
    timestamp: "2026-09-05 01:16:50 UTC",
    teamCrowns: 2,
    opponentCrowns: 1,
    player: {
      name: "Clash King",
      clan: "RISE GRAVEYARD™",
      rank: 3,
      trophies: 3852,
      trophyDelta: 19,
      avgElixir: 3.9,
      cycle: 12.0,
      elixirLeaked: 0.67,
      hp: 8840,
      deck: [
        { name: "Blast Rocket", level: 16 },
        { name: "Fireball", level: 16 },
        { name: "Spiky", level: 16 },
        { name: "Bomb Golem", level: 16 },
        { name: "Fire Birds", level: 16 },
        { name: "Cluster Bomb", level: 16 },
        { name: "Doggo Horde", level: 16 },
        { name: "Bomb Drone", level: 16 },
      ],
    },
    opponent: {
      name: "Friend✨安之",
      clan: "NoA",
      rank: 37,
      trophies: 3719,
      trophyDelta: -19,
      avgElixir: 3.8,
      cycle: 10.0,
      elixirLeaked: 2.15,
      hp: 7728,
      deck: [
        { name: "Flying Doggos", level: 16 },
        { name: "Balloon", level: 16 },
        { name: "Draggo", level: 16 },
        { name: "Tornado", level: 16 },
        { name: "Magma Golem", level: 16 },
        { name: "Bomb Frog", level: 16 },
        { name: "Doggos", level: 16 },
        { name: "Icicle", level: 16 },
      ],
    },
  },
  {
    result: "loss",
    mode: "Ranked",
    duration: "9m 41s",
    timestamp: "2026-09-04 22:03:12 UTC",
    teamCrowns: 0,
    opponentCrowns: 3,
    player: {
      name: "Clash King",
      clan: "RISE GRAVEYARD™",
      rank: 3,
      trophies: 3833,
      trophyDelta: -21,
      avgElixir: 3.6,
      cycle: 11.0,
      elixirLeaked: 1.42,
      hp: 8840,
      deck: [
        { name: "Plain Bomb", level: 16 },
        { name: "Blast Mine", level: 16 },
        { name: "Blast Rocket", level: 16 },
        { name: "Blast Bot", level: 16 },
        { name: "Bomb Birds", level: 16 },
        { name: "Bomb Spider", level: 16 },
        { name: "Tornado", level: 16 },
        { name: "Fireball", level: 16 },
      ],
    },
    opponent: {
      name: "MegaKnight",
      clan: "Badland Kings",
      rank: 41,
      trophies: 3702,
      trophyDelta: 21,
      avgElixir: 4.1,
      cycle: 13.0,
      elixirLeaked: 0.88,
      hp: 9120,
      deck: [
        { name: "Bomb Golem", level: 16 },
        { name: "Bombfly", level: 16 },
        { name: "Draggo", level: 16 },
        { name: "Tornado", level: 16 },
        { name: "Core Lightning", level: 16 },
        { name: "Flying Barrel", level: 16 },
        { name: "Doggos", level: 16 },
        { name: "Electromancer", level: 16 },
      ],
    },
  },
  {
    result: "win",
    mode: "Ranked",
    duration: "11m 02s",
    timestamp: "2026-09-04 18:47:55 UTC",
    teamCrowns: 3,
    opponentCrowns: 0,
    player: {
      name: "Clash King",
      clan: "RISE GRAVEYARD™",
      rank: 3,
      trophies: 3854,
      trophyDelta: 18,
      avgElixir: 3.9,
      cycle: 12.0,
      elixirLeaked: 0.55,
      hp: 8840,
      deck: [
        { name: "Blast Rocket", level: 16 },
        { name: "Fireball", level: 16 },
        { name: "Spiky", level: 16 },
        { name: "Bomb Golem", level: 16 },
        { name: "Fire Birds", level: 16 },
        { name: "Cluster Bomb", level: 16 },
        { name: "Doggo Horde", level: 16 },
        { name: "Bomb Drone", level: 16 },
      ],
    },
    opponent: {
      name: "Tornado",
      clan: "Inferno",
      rank: 52,
      trophies: 3655,
      trophyDelta: -18,
      avgElixir: 3.4,
      cycle: 9.0,
      elixirLeaked: 3.1,
      hp: 8840,
      deck: [
        { name: "Striker Boy", level: 16 },
        { name: "Fireball", level: 16 },
        { name: "Icicle", level: 16 },
        { name: "Doggos", level: 16 },
        { name: "Blast Mine", level: 16 },
        { name: "Tornado", level: 16 },
        { name: "Electromancer", level: 16 },
        { name: "Bombfly", level: 16 },
      ],
    },
  },
  {
    result: "win",
    mode: "Ranked",
    duration: "10m 33s",
    timestamp: "2026-09-04 15:22:08 UTC",
    teamCrowns: 2,
    opponentCrowns: 1,
    player: {
      name: "Clash King",
      clan: "RISE GRAVEYARD™",
      rank: 3,
      trophies: 3836,
      trophyDelta: 17,
      avgElixir: 3.9,
      cycle: 12.0,
      elixirLeaked: 0.9,
      hp: 8840,
      deck: [
        { name: "Blast Rocket", level: 16 },
        { name: "Fireball", level: 16 },
        { name: "Spiky", level: 16 },
        { name: "Bomb Golem", level: 16 },
        { name: "Fire Birds", level: 16 },
        { name: "Cluster Bomb", level: 16 },
        { name: "Doggo Horde", level: 16 },
        { name: "Bomb Drone", level: 16 },
      ],
    },
    opponent: {
      name: "IceWizard",
      clan: "Apex Brawl",
      rank: 60,
      trophies: 3601,
      trophyDelta: -17,
      avgElixir: 3.7,
      cycle: 10.5,
      elixirLeaked: 1.75,
      hp: 8840,
      deck: [
        { name: "Big Frost", level: 16 },
        { name: "Tornado", level: 16 },
        { name: "Blast Rocket", level: 16 },
        { name: "Bouncy Bomb", level: 16 },
        { name: "Striker Boy", level: 16 },
        { name: "Arrows", level: 16 },
        { name: "Laser Bunnies", level: 16 },
        { name: "Icicle", level: 16 },
      ],
    },
  },
  {
    result: "loss",
    mode: "Ranked",
    duration: "8m 57s",
    timestamp: "2026-09-04 11:09:40 UTC",
    teamCrowns: 1,
    opponentCrowns: 2,
    player: {
      name: "Clash King",
      clan: "RISE GRAVEYARD™",
      rank: 3,
      trophies: 3819,
      trophyDelta: -20,
      avgElixir: 3.9,
      cycle: 12.0,
      elixirLeaked: 1.2,
      hp: 8840,
      deck: [
        { name: "Blast Rocket", level: 16 },
        { name: "Fireball", level: 16 },
        { name: "Spiky", level: 16 },
        { name: "Bomb Golem", level: 16 },
        { name: "Fire Birds", level: 16 },
        { name: "Cluster Bomb", level: 16 },
        { name: "Doggo Horde", level: 16 },
        { name: "Bomb Drone", level: 16 },
      ],
    },
    opponent: {
      name: "Lava",
      clan: "Solo",
      rank: 33,
      trophies: 3740,
      trophyDelta: 20,
      avgElixir: 4.0,
      cycle: 12.5,
      elixirLeaked: 0.7,
      hp: 9120,
      deck: [
        { name: "Magma Golem", level: 16 },
        { name: "Balloon", level: 16 },
        { name: "Doggos", level: 16 },
        { name: "Flying Doggos", level: 16 },
        { name: "Fireball", level: 16 },
        { name: "Icicle", level: 16 },
        { name: "Bomb Frog", level: 16 },
        { name: "Draggo", level: 16 },
      ],
    },
  },
];

/* ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  initSeasonRecap();
});

async function initSeasonRecap() {
  const urlParams = new URLSearchParams(window.location.search);
  let playerTag = urlParams.get("tag") || urlParams.get("player");

  if (!playerTag) {
    playerTag = "#2808000";
  }

  if (!playerTag.startsWith("#")) {
    playerTag = "#" + playerTag;
  }

  const loadingEl = document.getElementById("loading-state");
  const errorEl = document.getElementById("error-state");
  const contentEl = document.getElementById("season-content");

  try {
    // --- REAL API: fetch live profile + battle history ---
    const [profile, battleHistory] = await Promise.all([
      fetchPlayerProfile(playerTag),
      fetchBattleHistory(playerTag, 50),
    ]);

    if (!profile || profile.error) {
      throw new Error("Player profile not found");
    }

    const seasonBattles = getCurrentSeasonBattles(battleHistory);
    renderRecentBattles(seasonBattles);
    renderSeasonStats(profile, seasonBattles);
    setupShareActions();

    loadingEl.classList.add("hidden");
    contentEl.classList.remove("hidden");

    if (profile.rank && profile.rank <= 100) {
      triggerConfetti();
    }
  } catch (err) {
    console.error("[Season] Failed to load season recap:", err);
    loadingEl.classList.add("hidden");
    errorEl.classList.remove("hidden");
  }
}

/* ==========================================================================
   MOST-USED CLONE (helper for season stats)
   ========================================================================== */

function getMostUsedCloneName(battleHistory) {
  const cloneUsageMap = {};
  battleHistory.forEach((battle) => {
    const deck = battle.player?.deck || battle.deck;
    if (Array.isArray(deck)) {
      deck.forEach((card) => {
        // Real API units have displayName (e.g. "Icicle") — prefer it over
        // the raw name ("TID_UNIT_ICICLE").
        const key =
          (typeof card === "object" && card.displayName) ||
          card.name ||
          card.id ||
          card;
        if (key && key !== "💣") {
          cloneUsageMap[key] = (cloneUsageMap[key] || 0) + 1;
        }
      });
    }
  });

  let topCloneName = "Plain Bomb";
  let maxCount = 0;
  Object.entries(cloneUsageMap).forEach(([name, count]) => {
    if (count > maxCount) {
      maxCount = count;
      topCloneName = name;
    }
  });
  return topCloneName;
}

function isLadder1v1Battle(battle) {
  const mode = String(battle?.mode || "")
    .trim()
    .toLowerCase();
  const teamSize = Number(battle?.teamSize ?? 1);

  if (teamSize !== 1) return false;
  if (mode === "survival" || mode === "event") return false;
  if (mode === "2v2") return false;

  return (
    mode === "1v1" ||
    mode === "ranked" ||
    mode === "pvp" ||
    mode === "ladder" ||
    mode === ""
  );
}

function getCurrentSeasonBattles(battles) {
  const now = new Date();
  return battles.filter((battle) => {
    const timestamp = new Date(battle.timestamp);
    return (
      isLadder1v1Battle(battle) &&
      !Number.isNaN(timestamp.getTime()) &&
      timestamp.getFullYear() === now.getFullYear() &&
      timestamp.getMonth() === now.getMonth()
    );
  });
}

/* ==========================================================================
   RECENT BATTLES LIST
   ========================================================================== */

/* ==========================================================================
   RECENT 1V1 BATTLES (battle-card layout)
   ========================================================================== */

function resolveCloneIcon(cardName) {
  const meta = resolveCloneMeta(cardName);
  if (meta?.file) return `assets/clones/${meta.file}`;

  // Fallback: try a direct filename match
  const key = String(cardName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `assets/clones/${key}.png`;
}

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

function buildBattleCard(battle) {
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

function renderRecentBattles(battles) {
  const container = document.getElementById("recent-battles-list");
  if (!container) return;

  container.innerHTML = "";

  if (!battles || battles.length === 0) {
    container.innerHTML = `<p style="color: var(--muted); text-align: center;">No recent 1v1 battle data found.</p>`;
    return;
  }

  battles.slice(0, 5).forEach((battle) => {
    const card = buildBattleCard(battle);
    container.appendChild(card);
  });
}

/* ==========================================================================
   HELPERS & VISUAL EFFECTS
   ========================================================================== */

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

function triggerConfetti() {
  const canvas = document.getElementById("confetti-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = Array.from({ length: 60 }).map(() => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    size: Math.random() * 8 + 4,
    color: ["#f5a623", "#c9881f", "#ffffff", "#2e7d32"][
      Math.floor(Math.random() * 4)
    ],
    speed: Math.random() * 3 + 2,
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      p.y += p.speed;
      if (p.y > canvas.height) p.y = -10;
    });

    frame++;
    if (frame < 180) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

function renderSeasonStats(profile, battleHistory) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  const finalRank =
    profile.lastSeasonRank || profile.rank || profile.globalRank || "--";
  const bestRank =
    profile.bestSeasonRank || profile.bestRank || profile.highestRank || "--";

  const wins = battleHistory.filter(
    (battle) => (battle.result || "").toLowerCase() === "win",
  ).length;
  const losses = battleHistory.filter(
    (battle) => (battle.result || "").toLowerCase() === "loss",
  ).length;
  const totalBattles = wins + losses;
  const winRate = totalBattles
    ? ((wins / totalBattles) * 100).toFixed(1)
    : "0.0";
  const firstFinishes =
    profile.seasonFirstPlaceFinishes ?? profile.currentSeasonFirstFinishes ?? 0;

  const rankLabel = (r) =>
    r && r > 0 ? `#${Number(r).toLocaleString()}` : "--";

  const now = new Date();
  const monthYearStr = now.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const signatureClone = getMostUsedCloneName(battleHistory);

  const playerName = profile.name || profile.displayName || "Unknown King";
  const playerTag = profile.tag || profile.playerTag || "--";
  set("stat-name-heading", playerName);
  set("stat-tag-heading", playerTag);
  set("stat-month-heading", monthYearStr);

  set("stat-best-rank-row", rankLabel(bestRank));
  set("stat-winrate-row", `${winRate}%`);
  set("stat-final-rank-row", rankLabel(finalRank));
  set("stat-battles-row", totalBattles.toLocaleString());
  set("stat-first-row", firstFinishes.toLocaleString());
  set("stat-clone-row", signatureClone);
  set("stat-wins-row", wins.toLocaleString());
  set("stat-losses-row", losses.toLocaleString());
}

function setupShareActions() {
  const downloadButton = document.getElementById("btn-download");
  const copyButton = document.getElementById("btn-copy-link");
  const card = document.querySelector(".stats-recap");

  downloadButton?.addEventListener("click", async () => {
    if (!card || typeof window.html2canvas !== "function") return;
    const canvas = await window.html2canvas(card, { useCORS: true, scale: 2 });
    const link = document.createElement("a");
    link.download = "BBmeta_SeasonRecap.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  copyButton?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(window.location.href);
    showNotification("Recap link copied!", "success");
  });
}
