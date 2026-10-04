import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { type, tag: rawTag } = req.query;
  if (!rawTag) return res.status(400).json({ error: "Missing tag" });

  const tag = "#" + String(rawTag).replace(/^#+/, "").toUpperCase();

  try {
    if (type === "top10") return await handleTop10(tag, res);
    if (type === "deck") return await handleFavoriteDeck(tag, res);
    if (type === "winrates") return await handleWinrates(tag, res);
    return res
      .status(400)
      .json({ error: "Invalid type. Use: top10 | deck | winrates" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function fetchPlayerApi(path) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY not configured");

  const response = await fetch(`https://api.badlandbrawl.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Player API returned ${response.status}`);
  }
  return data;
}

async function fetchBattleLog(tag) {
  const data = await fetchPlayerApi(
    `/v1/players/${encodeURIComponent(tag)}/battlelog?limit=50`,
  );
  return Array.isArray(data) ? data : data?.items || [];
}

async function handleTop10(tag, res) {
  const { data: seasons, error } = await supabase
    .from("seasons")
    .select("id, final_top_10")
    .eq("is_current", false);

  if (error) return res.status(500).json({ error: error.message });

  let top10Count = 0;
  let championCount = 0;
  const seasonsList = [];

  for (const season of seasons || []) {
    let top10 = season.final_top_10 || [];
    if (typeof top10 === "string") {
      try {
        top10 = JSON.parse(top10);
      } catch {
        top10 = [];
      }
    }
    if (!Array.isArray(top10)) continue;

    const entry = top10.find((player) => player.tag?.toUpperCase() === tag);
    if (entry) {
      top10Count++;
      if (entry.rank === 1) championCount++;
      seasonsList.push({ season: season.id, rank: entry.rank });
    }
  }

  res.setHeader(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=600",
  );
  return res
    .status(200)
    .json({ tag, top10Count, championCount, seasons: seasonsList });
}

async function handleFavoriteDeck(tag, res) {
  const battles = await fetchBattleLog(tag);
  const oneVsOne = [];
  const twoVsTwo = [];

  for (const battle of battles) {
    const units = battle.team?.[0]?.units || [];
    if (units.length !== 8) continue;

    const key = units.map((unit) => unit.id || unit.displayName).sort().join("|");
    const deck = units.map((unit) => ({
      id: unit.id,
      displayName: unit.displayName || unit.name,
      level: unit.level,
    }));

    const is2v2 = battle.mode === "2v2" || battle.teamSize === 2;
    (is2v2 ? twoVsTwo : oneVsOne).push({ key, deck });
  }

  function mostCommon(list) {
    if (list.length === 0) return null;
    const counts = new Map();
    for (const item of list) {
      const current = counts.get(item.key) || { count: 0, deck: item.deck };
      current.count++;
      counts.set(item.key, current);
    }
    const top = [...counts.values()].sort((a, b) => b.count - a.count)[0];
    return { deck: top.deck, matchCount: top.count, totalMatches: list.length };
  }

  let result = mostCommon(oneVsOne);
  let source = "1v1";

  if (!result || result.matchCount < 2) {
    const alternative = mostCommon(twoVsTwo);
    if (alternative && alternative.matchCount >= 2) {
      result = alternative;
      source = "2v2";
    }
  }

  if (!result) {
    const profile = await fetchPlayerApi(
      `/v1/players/${encodeURIComponent(tag)}`,
    );
    result = {
      deck: (profile.currentDeck || []).map((unit) => ({
        id: unit.id,
        displayName: unit.displayName || unit.name,
        level: unit.level,
      })),
      matchCount: 0,
      totalMatches: 0,
    };
    source = "current";
  }

  res.setHeader(
    "Cache-Control",
    "public, s-maxage=600, stale-while-revalidate=1200",
  );
  return res.status(200).json({
    tag,
    source,
    deck: result.deck,
    matchCount: result.matchCount,
    totalMatches: result.totalMatches,
  });
}

async function handleWinrates(tag, res) {
  const battles = await fetchBattleLog(tag);
  const modes = {
    "1v1": { wins: 0, losses: 0, total: 0 },
    "2v2": { wins: 0, losses: 0, total: 0 },
    survival: { wins: 0, losses: 0, total: 0 },
  };

  for (const battle of battles) {
    const mode = (battle.mode || "").toLowerCase();
    const teamSize = battle.teamSize || 1;
    const bucket =
      mode === "survival"
        ? "survival"
        : mode === "2v2" || teamSize === 2
          ? "2v2"
          : "1v1";
    const isWin = battle.result === "win" || battle.win === true;

    modes[bucket].total++;
    if (isWin) modes[bucket].wins++;
    else modes[bucket].losses++;
  }

  const result = Object.fromEntries(
    Object.entries(modes).map(([name, mode]) => [
      name,
      {
        ...mode,
        winRate:
          mode.total > 0
            ? Number(((mode.wins / mode.total) * 100).toFixed(1))
            : null,
      },
    ]),
  );

  res.setHeader(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=600",
  );
  return res.status(200).json({ tag, modes: result });
}