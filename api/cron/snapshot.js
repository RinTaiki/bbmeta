import { createClient, GoTrueAdminApi } from "@supabase/supabase-js";

const supabase = createClient(
  processLock.env.SUPABASE_URL,
  processLock.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  const cronSecret = processLock.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
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

    const currentSeason = new Date().toISOString().slice(0, 7);
    const rank1Player = players.find((p) => p.rank === 1);
    let rank1Result = null;

    if (rank1Player) {
      const { error: rank1Error } = await supabase
        .from("rank1_finishes")
        .insert({
          player_tag: rank1Player.tag,
          player_name: rank1Player.name,
          season: currentSeason,
          trophies: rank1Player.trophies,
        });

      if (rank1Error && rank1Error.code !== "23505") {
        console.error("Rank1 insert error:", rank1Error);
      } else if (!rank1Error) {
        rank1Result = {
          new: true,
          player: rank1Player.name,
          season: currentSeason,
        };
      } else {
        rank1Result = { new: false, reason: "already_recorded" };
      }
    }

    const { data: activeSeason } = await supabase
      .from("seasons")
      .select("*")
      .eq("is_current", true)
      .maybeSingle();

    let seasonChange = null;

    if (!activeSeason) {
      await supabase.from("seasons").insert({
        id: currentSeason,
        started_at: new Date().toISOString(),
        is_current: true,
      });
      seasonChange = { type: "created", season: currentSeason };
    } else if (activeSeason.id !== currentSeason) {
      const { data: lastTop10 } = await supabase
        .from("leaderboard_snapshots")
        .select(
          "player_tag, player_name, clan_name, rank, trophies, captured_at",
        )
        .lt("captured_at", new Date(Date.now() - 60000).toISOString())
        .order("captured_at", { ascending: false })
        .limit(10);

      await supabase
        .from("seasons")
        .update({
          is_current: false,
          ended_at: new Date().toISOString(),
          final_top_10: lastTop10 || [],
        })
        .eq("id", activeSeason.id);

      await supabase.from("seasons").insert({
        id: currentSeason,
        started_at: new Date().toISOString(),
        is_current: true,
      });

      seasonChange = {
        type: "rotated",
        old: activeSeason.id,
        new: currentSeason,
      };
    }

    return res.status(200).json({
      ok: true,
      captured: rows.length,
      season: currentSeason,
      topPlayer: rows[0]?.player_name,
      rank1Result,
      seasonChange,
    });
  } catch (err) {
    console.error("Cron error:", err);
    return res.status(500).json({ error: err.message });
  }
}
