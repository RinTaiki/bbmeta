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
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  let { tag } = req.query;
  if (!tag) return res.status(400).json({ error: "Missing tag" });

  tag = "#" + String(tag).replace(/^#+/, "").toUpperCase();

  try {
    const { data: seasons, error } = await supabase
      .from("seasons")
      .select(
        "id, ended_at, season_champion_tag, season_champion_name, final_top_10",
      )
      .eq("is_current", false)
      .order("ended_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const history = [];

    for (const season of seasons || []) {
      let top10 = season.final_top_10 || [];
      if (typeof top10 === "string") {
        try {
          top10 = JSON.parse(top10);
        } catch {
          top10 = [];
        }
      }

      const entry = top10.find((p) => p.tag?.toUpperCase() === tag);

      if (entry) {
        history.push({
          season: season.id,
          ended_at: season.ended_at,
          rank: entry.rank,
          trophies: entry.trophies,
          isChampion: entry.rank === 1,
        });
      }
    }

    const totalSeasons = history.length;
    const championCount = history.filter((h) => h.isChampion).length;
    const trackedBestRank = history.length
      ? Math.min(...history.map((h) => h.rank))
      : null;

    // ── Authoritative all-time best rank from the profile API ──
    // Falls back to the computed (tracked-only) value if the API is
    // unavailable, so the endpoint never hard-fails on this lookup.
    const apiKey = process.env.API_KEY;
    let trueBestRank = null;
    try {
      const profileRes = await fetch(
        `https://api.badlandbrawl.com/v1/players/${encodeURIComponent(tag)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (profileRes.ok) {
        const profile = await profileRes.json();
        trueBestRank = profile.bestSeasonRank || null;
      }
    } catch (e) {
      // Silent fail — we still return tracked data below
      console.warn("bestSeasonRank lookup failed:", e?.message || e);
    }

    const bestRank = trueBestRank ?? trackedBestRank;
    const bestRankSource = trueBestRank != null ? "api" : "tracked";

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    return res.status(200).json({
      tag,
      totalSeasons,
      championCount,
      bestRank,
      bestRankSource,
      history,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
