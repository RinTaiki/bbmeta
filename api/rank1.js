import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Fetch a player's #1 finishes
  if (req.method === "GET") {
    const { tag } = req.query;
    if (!tag) {
      return res.status(400).json({ error: "Missing tag parameter" });
    }

    try {
      const { data, error } = await supabase
        .from("rank1_finishes")
        .select("season, trophies, first_seen_at")
        .eq("player_tag", tag)
        .order("season", { ascending: false });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      res.setHeader(
        "Cache-Control",
        "public, s-maxage=300, stale-while-revalidate=600",
      );

      return res.status(200).json({
        tag,
        count: data.length,
        seasons: data.map((r) => ({
          season: r.season,
          trophies: r.trophies,
          firstSeenAt: r.first_seen_at,
        })),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // - Manual backfill (admin only)
  if (req.method === "POST") {
    const authHeader = req.headers.authorization || "";
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { player_tag, player_name, season, trophies } = req.body || {};

    if (!player_tag || !season) {
      return res.status(400).json({ error: "player_tag and season required" });
    }

    try {
      const { data, error } = await supabase
        .from("rank1_finishes")
        .insert({
          player_tag,
          player_name: player_name || null,
          season,
          trophies: trophies || null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return res
            .status(409)
            .json({ error: "Player already recorded for this season" });
        }
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ ok: true, record: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
