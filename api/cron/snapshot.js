import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 1. Fetch Top 10
    const apiKey = process.env.API_KEY;
    const apiRes = await fetch(
      "https://api.badlandbrawl.com/v1/rankings/players?limit=10",
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    if (!apiRes.ok) {
      return res.status(500).json({ error: `API error: ${apiRes.status}` });
    }

    const apiData = await apiRes.json();
    const players = apiData.items || [];

    if (players.length === 0) {
      return res.status(200).json({ ok: true, message: "No players" });
    }

    // 2. Determine current season (from our seasons table)
    const { data: active } = await supabase
      .from("seasons")
      .select("*")
      .eq("is_current", true)
      .maybeSingle();

    if (!active) {
      return res.status(500).json({
        error: "No active season — insert one in Supabase",
      });
    }

    const currentSeason = active.id;

    // 3. Insert snapshot rows (with season tag)
    const rows = players.map((p) => ({
      player_tag: p.tag,
      player_name: p.name,
      clan_name: p.clan?.name || null,
      rank: p.rank,
      trophies: p.trophies,
      exp_level: p.expLevel,
      season: currentSeason,
    }));

    const { error: insertError } = await supabase
      .from("leaderboard_snapshots")
      .insert(rows);

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    return res.status(200).json({
      ok: true,
      captured: rows.length,
      season: currentSeason,
      topPlayer: rows[0]?.player_name,
    });
  } catch (err) {
    console.error("Cron error:", err);
    return res.status(500).json({ error: err.message });
  }
}
