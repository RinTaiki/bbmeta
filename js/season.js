import { fetchPlayerProfile, fetchBattleHistory } from "./api.js";
import { CLONE_META } from "./clone-meta.js";
import { showNotification } from "./notifications.js";

document.addEventListener("DOMContentLoaded", () => {
  initSeasonRecap();
});

async function initSeasonRecap() {
  const urlParams = new URLSearchParams(window.location.search);
  let playerTag = urlParams.get("tag") || urlParams.get("player") || "#2808000";
  if (!playerTag.startsWith("#")) playerTag = "#" + playerTag;

  const loadingEl = document.getElementById("loading-state");
  const errorEl = document.getElementById("error-state");
  const contentEl = document.getElementById("season-content");

  try {
    // Fetch profile + battles + seasons list in parallel
    const [profile, battleHistory, seasonsData] = await Promise.all([
      fetchPlayerProfile(playerTag),
      fetchBattleHistory(playerTag, 50),
      fetchSeasonsData(),
    ]);

    if (!profile || profile.error) throw new Error("Player profile not found");

    // Determine the most-recent archived season (sorted desc by API)
    const season = seasonsData?.seasons?.[0] || null;

    // Filter the battle log to the season window (1v1 ranked only)
    const seasonBattles = filterSeasonBattles(battleHistory, season);

    renderSeasonStats(profile, seasonBattles, season);
    renderRecentBattles(seasonBattles);
    setupTagCopy(playerTag);
    setupShareActions();

    loadingEl.classList.add("hidden");
    contentEl.classList.remove("hidden");

    // Reveal choreography — stagger the stat cells in
    requestAnimationFrame(() => revealCard());

    if (profile.rank && profile.rank <= 100) triggerConfetti();
  } catch (err) {
    console.error("[Season] Failed to load season recap:", err);
    loadingEl.classList.add("hidden");
    errorEl.classList.remove("hidden");
  }
}

async function fetchSeasonsData() {
  try {
    const res = await fetch("/api/seasons");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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

function filterSeasonBattles(battles, season) {
  let windowStart;
  let windowEnd;

  if (season?.ended_at) {
    windowEnd = new Date(season.ended_at);
    windowStart = new Date(windowEnd.getTime() - 28 * 86400000);
  } else {
    // Fallback: current calendar month
    const now = new Date();
    windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
    windowEnd = now;
  }

  if (isNaN(windowEnd.getTime())) return [];

  return battles.filter((battle) => {
    if (!isLadder1v1Battle(battle)) return false;
    const ts = new Date(battle.timestamp);
    if (isNaN(ts.getTime())) return false;
    return ts >= windowStart && ts <= windowEnd;
  });
}

function computeFavoriteClone(battles) {
  const map = new Map();

  battles.forEach((battle) => {
    const deck = battle.player?.deck || battle.deck || [];
    if (!Array.isArray(deck)) return;

    deck.forEach((card) => {
      const id = card?.id;
      const displayName =
        (typeof card === "object" && (card.displayName || card.name)) ||
        (typeof card === "string" ? card : null);
      if (id == null && !displayName) return;

      const key = id != null ? `id:${id}` : `name:${displayName}`;
      const current = map.get(key) || { count: 0, id, displayName };
      current.count++;
      map.set(key, current);
    });
  });

  let best = null;
  map.forEach((v) => {
    if (!best || v.count > best.count) best = v;
  });
  return best;
}

function resolveCloneSrc(id, displayName) {
  if (id != null && CLONE_META[id]?.file) {
    return `assets/clones/${CLONE_META[id].file}`;
  }
  const key = String(displayName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return key ? `assets/clones/${key}.png` : "";
}

function formatSeasonMonth(seasonId) {
  if (!seasonId) return "Last season";
  const [year, month] = String(seasonId).split("-");
  if (!year || !month) return seasonId;
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (isNaN(date.getTime())) return seasonId;
  return date.toLocaleString("default", { month: "long", year: "numeric" });
}

function rankLabel(rank) {
  if (rank == null || rank === 0) return "Unranked";
  return `#${Number(rank).toLocaleString()}`;
}

function renderSeasonStats(profile, battles, season) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  // Header
  const playerName = profile.name || profile.displayName || "Unknown King";
  const playerTag = profile.tag || profile.playerTag || "#---";
  set("season-card-name", `Season Stats — ${playerName}`);
  set("season-card-tag", playerTag);
  set("season-card-month", formatSeasonMonth(season?.id));

  // Wins / losses / totals from filtered battles
  const wins = battles.filter(
    (b) => String(b.result || "").toLowerCase() === "win",
  ).length;
  const losses = battles.filter(
    (b) => String(b.result || "").toLowerCase() === "loss",
  ).length;
  const total = wins + losses;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";

  // Last season rank — authoritative from the profile
  const lastRank = profile.lastSeasonRank ?? null;
  set("stat-rank", rankLabel(lastRank));
  set("stat-winrate", total > 0 ? `${winRate}%` : "—");
  set("stat-battles", total.toLocaleString());
  set("stat-wins", wins.toLocaleString());
  set("stat-losses", losses.toLocaleString());

  // Favorite clone
  const favorite = computeFavoriteClone(battles);
  const iconEl = document.getElementById("stat-clone-icon");
  const nameEl = document.getElementById("stat-clone-name");

  if (favorite) {
    const displayName = favorite.displayName || "Unknown";
    const src = resolveCloneSrc(favorite.id, displayName);

    if (src) {
      iconEl.src = src;
      iconEl.alt = displayName;
      iconEl.hidden = false;
      iconEl.onerror = () => {
        iconEl.hidden = true;
      };
    } else {
      iconEl.hidden = true;
    }
    nameEl.textContent = displayName;
  } else {
    iconEl.hidden = true;
    nameEl.textContent = "—";
  }
}

function revealCard() {
  const card = document.getElementById("season-card");
  if (!card) return;
  card.classList.add("is-revealed");

  const stats = card.querySelectorAll(".season-stat");
  stats.forEach((el, i) => {
    el.style.setProperty("--reveal-i", String(i));
  });
}

function setupTagCopy(originalTag) {
  const tagEl = document.getElementById("season-card-tag");
  if (!tagEl) return;

  let resetTimer = null;

  const handleCopy = async () => {
    if (tagEl.dataset.copied === "true") return;

    try {
      await navigator.clipboard.writeText(originalTag);
      showNotification("Copied to clipboard!", "success");

      tagEl.dataset.copied = "true";
      tagEl.textContent = "Copied!";
      tagEl.classList.add("is-copied");

      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        tagEl.textContent = originalTag;
        tagEl.classList.remove("is-copied");
        delete tagEl.dataset.copied;
      }, 1200);
    } catch (err) {
      console.error("Clipboard write failed:", err);
      showNotification("Couldn't copy — try manually", "error");
    }
  };

  tagEl.addEventListener("click", handleCopy);
  tagEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCopy();
    }
  });
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

function resolveCloneIcon(cardName) {
  const meta = resolveCloneMeta(cardName);
  if (meta?.file) return `assets/clones/${meta.file}`;

  const key = String(cardName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `assets/clones/${key}.png`;
}

function resolveCloneByUnit(unit) {
  if (unit?.id != null && CLONE_META[unit.id]) return CLONE_META[unit.id];
  return resolveCloneMeta(unit?.name);
}

function resolveCloneIconByUnit(unit) {
  const meta = resolveCloneByUnit(unit);
  if (meta?.file) return `assets/clones/${meta.file}`;
  return resolveCloneIcon(unit?.name);
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

  const rawMode = (battle.mode || "").toLowerCase();
  const is2v2 = battle.teamSize === 2 || rawMode === "2v2";
  const isSurvival = rawMode === "survival";
  const modeLabel = is2v2 ? "2v2" : isSurvival ? "Survival" : "Ranked";
  const modeClass = is2v2 ? "is-2v2" : isSurvival ? "is-survival" : "is-ranked";

  const card = document.createElement("div");
  card.className = `battle-card ${isWin ? "is-win" : isDraw ? "is-draw" : "is-loss"}`;

  // Header
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

  // Emotes
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

  // Teams
  const teams = document.createElement("div");
  teams.className = "battle-teams";

  const playerTeam = battle.player || { name: "You", deck: battle.deck || [] };
  const opponentTeam = battle.opponent || { name: "Enemy King" };

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

  // Footer
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
    container.innerHTML = `<p class="battles-empty">No 1v1 battles in the season window.</p>`;
    return;
  }

  battles.slice(0, 5).forEach((battle) => {
    container.appendChild(buildBattleCard(battle));
  });
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

function triggerConfetti() {
  const canvas = document.getElementById("confetti-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = Array.from({ length: 80 }).map(() => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    size: Math.random() * 8 + 4,
    color: ["#f5b942", "#c9881f", "#fff6dd", "#e0952a"][
      Math.floor(Math.random() * 4)
    ],
    speed: Math.random() * 3 + 2,
    drift: (Math.random() - 0.5) * 1.2,
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      p.y += p.speed;
      p.x += p.drift;
      if (p.y > canvas.height) p.y = -10;
    });

    frame++;
    if (frame < 220) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

function setupShareActions() {
  const downloadButton = document.getElementById("btn-download");
  const copyButton = document.getElementById("btn-copy-link");
  const card = document.getElementById("season-card");

  downloadButton?.addEventListener("click", async () => {
    if (!card || typeof window.html2canvas !== "function") return;
    try {
      const canvas = await window.html2canvas(card, {
        useCORS: true,
        scale: 2,
        backgroundColor: null,
      });
      const link = document.createElement("a");
      link.download = "BBmeta_SeasonRecap.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      showNotification("Recap downloaded!", "success");
    } catch (err) {
      console.error("PNG export failed:", err);
      showNotification("Couldn't export image", "error");
    }
  });

  copyButton?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showNotification("Recap link copied!", "success");
    } catch {
      showNotification("Couldn't copy link", "error");
    }
  });
}
