import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  // Protect: only allow Vercel cron or requests with the secret
  const authHeader = req.headers.authorization || "";
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 1. Fetch Top 10 from Badland Brawl API
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
      return res
        .status(200)
        .json({ ok: true, message: "No players to snapshot" });
    }

    // 2. Insert snapshot rows
    const rows = players.map((p) => ({
      player_tag: p.tag,
      player_name: p.name,
      clan_name: p.clan?.name || null,
      rank: p.rank,
      trophies: p.trophies,
      exp_level: p.expLevel,
    }));

    const { error: insertError } = await supabase
      .from("leaderboard_snapshots")
      .insert(rows);

    if (insertError) {
      console.error("Insert error:", insertError);
      return res.status(500).json({ error: insertError.message });
    }

    // 3. Check if season changed (YYYY-MM format)
    const currentSeason = new Date().toISOString().slice(0, 7); // "2026-09"
    const { data: active } = await supabase
      .from("seasons")
      .select("*")
      .eq("is_current", true)
      .maybeSingle();

    if (!active) {
      // First run — create the current season
      await supabase.from("seasons").insert({
        id: currentSeason,
        started_at: new Date().toISOString(),
        is_current: true,
      });
    } else if (active.id !== currentSeason) {
      // Season changed — archive the old one
      const { data: finalTop10 } = await supabase
        .from("leaderboard_snapshots")
        .select("*")
        .order("captured_at", { ascending: false })
        .limit(10);

      await supabase
        .from("seasons")
        .update({
          is_current: false,
          ended_at: new Date().toISOString(),
          final_top_10: finalTop10,
        })
        .eq("id", active.id);

      // Start the new season
      await supabase.from("seasons").insert({
        id: currentSeason,
        started_at: new Date().toISOString(),
        is_current: true,
      });
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
