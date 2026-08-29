const API_BASE = "";

let requestCount = 0;
let lastReset = Date.now();

async function safeFetch(url, options = {}) {
  if (Date.now() - lastReset > 60000) {
    requestCount = 0;
    lastReset = Date.now();
  }

  if (requestCount >= 100) {
    throw new Error("Rate limit exceeded. Wait a moment.");
  }

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

export async function fetchLeaderboard(country = "", limit = 200) {
  const cacheKey = `leaderboard_data_${country}_${limit}`;
  const cached = getCachedData(cacheKey);

  if (cached) {
    console.log("[API] Returning cached leaderboard data");
    return cached;
  }

  let url = `/api/v1/rankings/players?limit=${limit}`;
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

  const url = `/api/v1/players/${encodeURIComponent(tag)}`;
  const response = await safeFetch(url);
  const data = await response.json();
  setCachedData(cacheKey, data);
  return data;
}

export async function fetchBattleLog(tag, limit = 10) {
  const url = `/api/v1/players/${encodeURIComponent(tag)}/battlelog?limit=${limit}`;
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

  let url = `/api/v2/meta/decks?days=${days}&limit=${limit}`;
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

  let url = `/api/v2/meta/units?days=7`;
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

export async function fetchBattleHistory(tag, limit = 10) {
  const cacheKey = `battle_history_${tag}_${limit}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const raw = await fetchBattleLog(tag, limit);
  const battles = Array.isArray(raw) ? raw : raw?.items || raw?.battles || [];

  const normalized = battles.map((b) => {
    const playerTeam = b.team?.[0] || {};
    const units = playerTeam.units || b.deck || b.clones || [];
    const deck = units.map((u) => ({
      name: u.displayName || u.name || "Clone",
      icon: u.icon || null,
    }));

    return {
      result: b.result || (b.win ? "win" : "loss"),
      timestamp: b.battleTime || b.timestamp || b.time || b.createdAt || null,
      mode: b.mode || (b.teamSize === 2 ? "2v2" : "1v1"),
      teamSize: b.teamSize || 1,
      deck: deck.length ? deck : Array(8).fill("💣"),
      opponent: b.opponent || { name: b.opponentName || "Opponent" },
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
    const url = `/api/v1/players/${encodeURIComponent(tag)}/history?days=30`;
    const response = await safeFetch(url);
    const data = await response.json();

    const items = Array.isArray(data) ? data : data?.items || [];
    const dates = [];
    const trophies = [];

    items.forEach((item) => {
      if (item.trophies == null) return;
      dates.push(item.date || item.timestamp || item.battleTime || "");
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
    const response = await safeFetch(`/api/v1/rankings/players?limit=1`);
    return response.ok;
  } catch {
    return false;
  }
}
