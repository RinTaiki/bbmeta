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
const CLIENT_REQUEST_LIMIT = 50;

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
  options.signal?.throwIfAborted();
  const now = Date.now();

  // Reset counter every 60 s
  if (now - lastReset > 60000) {
    requestCount = 0;
    lastReset = Date.now();
  }

  // If we're approaching the per-minute cap, pause until the window resets
  if (requestCount >= CLIENT_REQUEST_LIMIT) {
    const waitTime = 60000 - (Date.now() - lastReset) + 200;
    console.warn(`[API] Rate limit window full, waiting ${waitTime}ms`);
    await waitForRequestDelay(waitTime, options.signal);
    requestCount = 0;
    lastReset = Date.now();
  }

  // Enforce a minimum gap of 150 ms between any two requests
  if (lastRequestTime) {
    const gap = 150 - (Date.now() - lastRequestTime);
    if (gap > 0) {
      await waitForRequestDelay(gap, options.signal);
    }
  }

  options.signal?.throwIfAborted();
  lastRequestTime = Date.now();
  requestCount++;
  const { timeoutMs, signal, ...fetchOptions } = options;
  // Start network timeouts after queueing, not while waiting for a rate-limit slot.
  const timeout = timeoutMs ? AbortSignal.timeout(timeoutMs) : null;
  const requestSignal =
    signal && timeout ? AbortSignal.any([signal, timeout]) : signal || timeout;
  return fetch(url, {
    ...fetchOptions,
    ...(requestSignal ? { signal: requestSignal } : {}),
  });
}

function waitForRequestDelay(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        signal?.removeEventListener("abort", cancel);
        resolve();
      },
      Math.max(0, ms),
    );
    function cancel() {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(signal.reason);
    }
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

function removeCachedData(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function getCachedData(key) {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const { timestamp, data } = JSON.parse(cached);
    const age = Date.now() - timestamp;
    if (Number.isFinite(age) && age >= 0 && age < 5 * 60 * 1000) return data;
  } catch {}
  removeCachedData(key);
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
  try {
    // Iterate backwards so deleting an entry doesn't skip its neighbour.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
        continue;
      try {
        const { timestamp } = JSON.parse(localStorage.getItem(key));
        const age = Date.now() - timestamp;
        if (!Number.isFinite(age) || age < 0 || age >= 5 * 60 * 1000)
          removeCachedData(key);
      } catch {
        removeCachedData(key);
      }
    }
  } catch {
    // Browsers may deny storage entirely; API requests must still work.
  }
}

// Sweep once at module load so stale data never survives a page refresh
purgeExpiredCaches();

export async function fetchLeaderboard(
  country = "",
  limit = 200,
  { signal } = {},
) {
  // A fresh namespace avoids reusing fabricated rankings cached by the old fallback.
  const cacheKey = `leaderboard_data_v2_${country}_${limit}`;
  const cached = getCachedData(cacheKey);
  if (Array.isArray(cached)) return cached;
  let url = `${API_BASE}${PATH_PREFIX}/v1/rankings/players?limit=${limit}`;
  if (country) url += `&country=${encodeURIComponent(country)}`;
  const response = await safeFetch(url, { signal, timeoutMs: 20000 });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = await response.json();
  const players = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(players)) throw new Error("Invalid leaderboard response");
  setCachedData(cacheKey, players);
  return players;
}

export async function fetchPlayerProfile(tag, { signal } = {}) {
  const cacheKey = `player_${tag}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const url = `${API_BASE}${PATH_PREFIX}/v1/players/${encodeURIComponent(tag)}`;

  try {
    const response = await safeFetch(url, { signal, timeoutMs: 15000 });
    const data = await response.json();

    if (response.status === 429) throw new Error("RATE_LIMIT");
    if (!response.ok || data?.error || data?.detail) {
      throw new Error(
        data?.error || data?.detail || `API error: ${response.status}`,
      );
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
  if (!response.ok) {
    throw new Error(`Battle log API error: ${response.status}`);
  }
  const data = await response.json();

  return Array.isArray(data) ? data : data?.items || [];
}

export async function fetchMetaDecks(
  days = 7,
  limit = 50,
  { minTrophies, maxTrophies, signal } = {},
) {
  const cacheKey = `meta_decks_v2_${days}_${limit}_${minTrophies ?? ""}_${maxTrophies ?? ""}`;
  const cached = getCachedData(cacheKey);
  if (Array.isArray(cached)) return cached;

  let url = `${API_BASE}${PATH_PREFIX}/v2/meta/decks?days=${days}&limit=${limit}`;
  if (minTrophies != null)
    url += `&minTrophies=${encodeURIComponent(minTrophies)}`;
  if (maxTrophies != null)
    url += `&maxTrophies=${encodeURIComponent(maxTrophies)}`;

  const response = await safeFetch(url, { signal, timeoutMs: 20000 });
  if (!response.ok) throw new Error(`Meta decks API error: ${response.status}`);
  const data = await response.json();
  const items = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(items)) throw new Error("Invalid meta decks response");
  setCachedData(cacheKey, items);
  return items;
}

export async function fetchCloneStats(
  minTrophies = null,
  maxTrophies = null,
  timeframe = "7d",
  { signal } = {},
) {
  const days = { "7d": 7, "30d": 30 }[timeframe];
  if (!days) throw new Error("Unsupported clone stats timeframe");
  // Include the window and use a fresh namespace to avoid old mock snapshots.
  const cacheKey = `clone_stats_v2_${days}_${minTrophies ?? ""}_${maxTrophies ?? ""}`;
  const cached = getCachedData(cacheKey);
  if (Array.isArray(cached)) return cached;
  const params = new URLSearchParams({ days: String(days) });
  if (minTrophies != null) params.set("minTrophies", String(minTrophies));
  if (maxTrophies != null) params.set("maxTrophies", String(maxTrophies));
  const response = await safeFetch(
    `${API_BASE}${PATH_PREFIX}/v2/meta/units?${params}`,
    {
      signal,
      timeoutMs: 20000,
    },
  );
  if (!response.ok)
    throw new Error(`Clone stats API error: ${response.status}`);
  const data = await response.json();
  const units = Array.isArray(data)
    ? data
    : (data?.items ?? data?.units ?? data?.data);
  if (!Array.isArray(units)) throw new Error("Invalid clone stats response");
  setCachedData(cacheKey, units);
  return units;
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
  if (Array.isArray(cached) && cached.length > 0) return cached;
  if (Array.isArray(cached)) removeCachedData(cacheKey);

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
