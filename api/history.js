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

  let { tag, days = 30 } = req.query;
  if (!tag) return res.status(400).json({ error: "Missing tag" });

  tag = "#" + String(tag).replace(/^#+/, "").toUpperCase();
  const dayCount = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
  const since = new Date(
    Date.now() - dayCount * 24 * 60 * 60 * 1000,
  ).toISOString();

  try {
    const { data, error } = await supabase
      .from("player_snapshots")
      .select("captured_at, rank, trophies, exp_level, source")
      .eq("player_tag", tag)
      .gte("captured_at", since)
      .order("captured_at", { ascending: true })
      .limit(1000);

    if (error) return res.status(500).json({ error: error.message });

    const points = data || [];

    // Summary stats
    let bestRank = null,
      peakTrophies = null,
      lowestTrophies = null;
    for (const p of points) {
      if (p.rank != null && (bestRank === null || p.rank < bestRank))
        bestRank = p.rank;
      if (p.trophies != null) {
        if (peakTrophies === null || p.trophies > peakTrophies)
          peakTrophies = p.trophies;
        if (lowestTrophies === null || p.trophies < lowestTrophies)
          lowestTrophies = p.trophies;
      }
    }

    res.setHeader("Cache-Control", "public, s-maxage=300");
    return res.status(200).json({
      tag,
      days: dayCount,
      points,
      summary: {
        count: points.length,
        bestRank,
        peakTrophies,
        lowestTrophies,
        firstSeen: points[0]?.captured_at || null,
        lastSeen: points[points.length - 1]?.captured_at || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
