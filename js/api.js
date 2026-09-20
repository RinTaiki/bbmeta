// Detect environment
const IS_LOCAL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

// When local, hit the LIVE Vercel proxy (no local node needed!)
// When production, use relative /api (Vercel's own proxy)
const API_BASE = IS_LOCAL ? "https://bbmeta.vercel.app" : "";
const PATH_PREFIX = "/api";

let requestCount = 0;
let lastReset = Date.now();
let lastRequestTime = 0;

// Serial queue so concurrent callers share one throttling chain
// instead of each independently waiting the same full delay.
let _queueTail = Promise.resolve();

function safeFetch(url, options = {}) {
  // Chain onto the queue — the throttle logic runs inside the
  // chain so only one caller at a time decides whether to wait.
  const ticket = _queueTail.then(() => _throttledFetch(url, options));
  // Advance the tail (errors don't block the queue).
  _queueTail = ticket.catch(() => {});
  return ticket;
}

async function _throttledFetch(url, options) {
  const now = Date.now();

  // Reset counter every 60 s
  if (now - lastReset > 60000) {
    requestCount = 0;
    lastReset = Date.now();
  }

  // If we're approaching the per-minute cap, pause until the window resets
  if (requestCount >= 80) {
    const waitTime = 60000 - (Date.now() - lastReset) + 200;
    console.warn(`[API] Rate limit window full, waiting ${waitTime}ms`);
    await new Promise((r) => setTimeout(r, waitTime));
    requestCount = 0;
    lastReset = Date.now();
  }

  // Enforce a minimum gap of 150 ms between any two requests
  if (lastRequestTime) {
    const gap = 150 - (Date.now() - lastRequestTime);
    if (gap > 0) {
      await new Promise((r) => setTimeout(r, gap));
    }
  }

  lastRequestTime = Date.now();
  requestCount++;
  return fetch(url, options);
}

function getCachedData(key) {
  const cached = localStorage.getItem(key);
  if (!cached) return null;

  try {
    const { timestamp, data } = JSON.parse(cached);
    const FIVE_MINUTES = 5 * 60 * 1000;
    if (Date.now() - timestamp < FIVE_MINUTES) {
      return data;
    }
    localStorage.removeItem(key);
  } catch (e) {
    localStorage.removeItem(key);
  }
  return null;
}

function setCachedData(key, data) {
  const payload = {
    timestamp: Date.now(),
    data,
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.warn("LocalStorage full or quota exceeded", e);
  }
}

// Prefixes used for all BBmeta cache keys (see setCachedData callers)
const CACHE_PREFIXES = [
  "leaderboard_data_",
  "player_",
  "meta_decks_",
  "clone_stats_",
  "battle_history_",
  "trophy_history_",
];

// Purge every expired cache entry, not just the one being read.
// Entries for filters/players that are never revisited would otherwise
// linger in localStorage forever (e.g. stale country-filter caches).
function purgeExpiredCaches() {
  const MAX_AGE = 5 * 60 * 1000;
  const now = Date.now();
  let purged = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !CACHE_PREFIXES.some((p) => key.startsWith(p))) continue;

    try {
      const { timestamp } = JSON.parse(localStorage.getItem(key));
      if (now - timestamp >= MAX_AGE) {
        localStorage.removeItem(key);
        purged++;
      }
    } catch {
      // Unparseable entry — treat as corrupt and remove
      localStorage.removeItem(key);
      purged++;
    }
  }

  if (purged > 0) {
    console.log(
      `[API] Purged ${purged} expired cache entr${purged === 1 ? "y" : "ies"}`,
    );
  }
}

// Sweep once at module load so stale data never survives a page refresh
purgeExpiredCaches();

export async function fetchLeaderboard(country = "", limit = 200) {
  const cacheKey = `leaderboard_data_${country}_${limit}`;
  const cached = getCachedData(cacheKey);

  if (cached) {
    console.log("[API] Returning cached leaderboard data");
    return cached;
  }

  let url = `${API_BASE}${PATH_PREFIX}/v1/rankings/players?limit=${limit}`;
  if (country) {
    url += `&country=${encodeURIComponent(country)}`;
  }

  try {
    const response = await safeFetch(url);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const players = Array.isArray(data) ? data : data?.items || [];
    setCachedData(cacheKey, players);
    return players;
  } catch (error) {
    console.warn(
      "[API] Fetch failed, providing fallback mock data for testing.",
      error,
    );

    const mockData = generateMockLeaderboard(country, limit);
    setCachedData(cacheKey, mockData);
    return mockData;
  }
}

function generateMockLeaderboard(country, limit) {
  const mockNames = [
    "BrawlMaster",
    "KingBlast",
    "Clony",
    "FrogPower",
    "CanyonHero",
    "LavaLord",
    "ShadowBlade",
    "Tactician",
    "StormRider",
    "BombQueen",
  ];
  const mockClans = [
    "Alpha Tribe",
    "Badland Kings",
    "Apex Brawl",
    "Inferno",
    "Solo",
  ];

  const players = [];
  const maxCount = Math.min(limit, 200);

  for (let i = 1; i <= maxCount; i++) {
    const baseTrophies = 18500 - i * 35 + Math.floor(Math.random() * 20);
    const wins = Math.floor(Math.random() * 300) + 100;
    const losses = Math.floor(Math.random() * 100) + 20;
    const name = `${mockNames[i % mockNames.length]}_${i}`;
    const tag = `#${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const rankChange =
      i <= 3
        ? Math.floor(Math.random() * 3) + 1
        : Math.floor(Math.random() * 11) - 5;

    players.push({
      rank: i,
      name: name,
      tag: tag,
      trophies: baseTrophies,
      clan: mockClans[i % mockClans.length],
      winRate: ((wins / (wins + losses)) * 100).toFixed(1),
      rankChange: rankChange,
      country: country || "US",
    });
  }

  return players;
}

export async function fetchPlayerProfile(tag) {
  const cacheKey = `player_${tag}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const url = `${API_BASE}${PATH_PREFIX}/v1/players/${encodeURIComponent(tag)}`;

  try {
    const response = await safeFetch(url);
    const data = await response.json();

    if (!response.ok || data?.error || data?.detail) {
      return data;
    }

    setCachedData(cacheKey, data);
    return data;
  } catch (err) {
    console.warn(`[API] fetchPlayerProfile failed for ${tag}:`, err.message);
    throw err;
  }
}

export async function fetchBattleLog(tag, limit = 10) {
  const url = `${API_BASE}${PATH_PREFIX}/v1/players/${encodeURIComponent(tag)}/battlelog?limit=${limit}`;
  const response = await safeFetch(url);
  const data = await response.json();

  return Array.isArray(data) ? data : data?.items || [];
}

export async function fetchMetaDecks(
  days = 7,
  limit = 50,
  { minTrophies, maxTrophies } = {},
) {
  const cacheKey = `meta_decks_${days}_${limit}_${minTrophies || ""}_${maxTrophies || ""}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  let url = `${API_BASE}${PATH_PREFIX}/v2/meta/decks?days=${days}&limit=${limit}`;
  if (minTrophies != null)
    url += `&minTrophies=${encodeURIComponent(minTrophies)}`;
  if (maxTrophies != null)
    url += `&maxTrophies=${encodeURIComponent(maxTrophies)}`;

  const response = await safeFetch(url);
  const data = await response.json();
  setCachedData(cacheKey, data);
  return data;
}

export async function fetchCloneStats(minTrophies = null, maxTrophies = null) {
  const cacheKey = `clone_stats_${minTrophies || ""}_${maxTrophies || ""}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  let url = `${API_BASE}${PATH_PREFIX}/v2/meta/units?days=7`;
  if (minTrophies != null)
    url += `&minTrophies=${encodeURIComponent(minTrophies)}`;
  if (maxTrophies != null)
    url += `&maxTrophies=${encodeURIComponent(maxTrophies)}`;

  try {
    const response = await safeFetch(url);
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data = await response.json();
    const units = Array.isArray(data)
      ? data
      : data?.items || data?.units || data?.data || [];
    setCachedData(cacheKey, units);
    return units;
  } catch (error) {
    console.warn(
      "[API] Clone stats fetch failed, providing fallback mock data.",
      error,
    );

    const mock = generateMockCloneStats(minTrophies, maxTrophies);
    setCachedData(cacheKey, mock);
    return mock;
  }
}

function generateMockCloneStats(minTrophies = null, maxTrophies = null) {
  const names = [
    "Bomber",
    "Cannon",
    "Healer",
    "Shieldbearer",
    "Pyro",
    "Frost Mage",
    "Sapper",
    "Berserker",
    "Trapper",
    "Oracle",
    "Golem",
    "Scout",
  ];
  const rarities = ["primal", "evolved", "mythical", "unreal"];

  return names.map((name, i) => {
    const usage = Math.round((40 - i * 2.5 + Math.random() * 6) * 10) / 10;
    const winRate = Math.round((48 + Math.random() * 12) * 10) / 10;
    const sampleSize = Math.floor(200 + Math.random() * 4800);
    return {
      unitId: `unit_${i + 1}`,
      displayName: name,
      name,
      rarity: rarities[i % rarities.length],
      usage,
      winRate,
      sampleSize,
    };
  });
}

function normalizeUnits(units) {
  if (!Array.isArray(units)) return [];
  return units.map((u) => ({
    id: u.id ?? null,
    name: u.displayName || u.name || "Clone",
    level: u.level ?? 16,
  }));
}

export async function fetchBattleHistory(tag, limit = 10) {
  const cacheKey = `battle_history_${tag}_${limit}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const raw = await fetchBattleLog(tag, limit);
  const battles = Array.isArray(raw) ? raw : raw?.items || raw?.battles || [];

  const normalized = battles.map((b) => {
    const playerTeam = b.team?.[0] || {};
    const opp = b.opponent || {};

    const playerUnits = playerTeam.units || b.deck || b.clones || [];
    const oppUnits = opp.units || opp.deck || opp.clones || [];

    const score = b.score || {};
    const teamCrowns = score.player ?? b.teamCrowns ?? null;
    const oppCrowns = score.opponent ?? b.opponentCrowns ?? null;

    const durationSeconds = b.durationSeconds ?? null;
    const duration =
      b.duration ||
      (durationSeconds != null
        ? `${Math.floor(durationSeconds / 60)}m ${String(
            durationSeconds % 60,
          ).padStart(2, "0")}s`
        : "--");

    const trophyDelta =
      b.trophyChange ?? playerTeam.trophyChange ?? opp.trophyChange ?? 0;

    const rawResult = String(
      b.result || (b.win ? "win" : "loss"),
    ).toLowerCase();

    return {
      result:
        rawResult === "draw" || rawResult === "tie"
          ? "draw"
          : rawResult === "lose"
            ? "loss"
            : rawResult,
      timestamp: b.battleTime || b.timestamp || b.time || b.createdAt || null,
      mode: b.mode || (b.teamSize === 2 ? "2v2" : "1v1"),
      teamSize: b.teamSize || 1,
      duration,
      teamCrowns,
      opponentCrowns: oppCrowns,
      player: {
        name: playerTeam.name || "You",
        clan: playerTeam.clan?.name || playerTeam.clan || "",
        rank: playerTeam.rank ?? null,
        trophies: playerTeam.trophies ?? null,
        trophyDelta,
        deck: normalizeUnits(playerUnits),
      },
      opponent: {
        name: opp.name || opp.opponentName || "Opponent",
        clan: opp.clan?.name || opp.clan || "",
        rank: opp.rank ?? null,
        trophies: opp.trophies ?? null,
        trophyDelta: opp.trophyChange ?? null,
        deck: normalizeUnits(oppUnits),
      },
    };
  });

  setCachedData(cacheKey, normalized);
  return normalized;
}

export async function fetchTrophyHistory(tag) {
  const cacheKey = `trophy_history_${tag}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const url = `${API_BASE}${PATH_PREFIX}/v1/players/${encodeURIComponent(tag)}/history?days=30`;
    const response = await safeFetch(url);
    const data = await response.json();

    const items = Array.isArray(data) ? data : data?.items || [];
    const dates = [];
    const trophies = [];

    const now = new Date();
    const seasonStart = new Date(now.getFullYear(), now.getMonth(), 1);

    items.forEach((item) => {
      if (item.trophies == null) return;
      const rawDate = item.date || item.timestamp || item.battleTime || "";
      const d = new Date(rawDate);
      if (!isNaN(d.getTime()) && d < seasonStart) return;
      dates.push(rawDate);
      trophies.push(item.trophies ?? item.value ?? 0);
    });

    const history = { dates, trophies };
    setCachedData(cacheKey, history);
    return history;
  } catch {
    return { dates: [], trophies: [] };
  }
}

export async function validateApiKey() {
  try {
    const response = await safeFetch(
      `${API_BASE}${PATH_PREFIX}/v1/rankings/players?limit=1`,
    );
    return response.ok;
  } catch {
    return false;
  }
}
