import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 1. Find the active season
    const { data: active } = await supabase
      .from("seasons")
      .select("*")
      .eq("is_current", true)
      .maybeSingle();

    if (!active) {
      return res.status(400).json({ error: "No active season to end" });
    }

    // 2. Get the last snapshot group from this season
    const { data: latestRow } = await supabase
      .from("leaderboard_snapshots")
      .select("captured_at")
      .eq("season", active.id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestRow) {
      return res.status(400).json({ error: "No snapshots for this season" });
    }

    const { data: finalTop10 } = await supabase
      .from("leaderboard_snapshots")
      .select("*")
      .eq("season", active.id)
      .eq("captured_at", latestRow.captured_at)
      .order("rank", { ascending: true });

    if (!finalTop10 || finalTop10.length === 0) {
      return res.status(400).json({ error: "Empty final top 10" });
    }

    // 3. Determine champion (rank 1)
    const champion = finalTop10.find((p) => p.rank === 1);
    if (!champion) {
      return res.status(400).json({ error: "No rank 1 in final top 10" });
    }

    // 4. Fetch champion's current deck
    const apiKey = process.env.API_KEY;
    let championDeck = [];
    try {
      const profileRes = await fetch(
        `https://api.badlandbrawl.com/v1/players/${encodeURIComponent(champion.player_tag)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      const profile = await profileRes.json();
      championDeck = profile.currentDeck || [];
    } catch (e) {
      console.error("Deck fetch failed:", e.message);
    }

    // 5. Archive the season
    const finalPayload = finalTop10.map((p) => ({
      rank: p.rank,
      tag: p.player_tag,
      name: p.player_name,
      trophies: p.trophies,
      clan: p.clan_name,
      deck: p.rank === 1 ? championDeck : [],
    }));

    const { error: updateError } = await supabase
      .from("seasons")
      .update({
        is_current: false,
        ended_at: new Date().toISOString(),
        season_champion_tag: champion.player_tag,
        season_champion_name: champion.player_name,
        season_champion_trophies: champion.trophies,
        final_top_10: finalPayload,
      })
      .eq("id", active.id);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // 6. Record the #1 finish
    const { error: rank1Error } = await supabase.from("rank1_finishes").insert({
      player_tag: champion.player_tag,
      player_name: champion.player_name,
      season: active.id,
      trophies: champion.trophies,
    });

    // 23505 = unique violation (already recorded — fine)
    if (rank1Error && rank1Error.code !== "23505") {
      return res.status(500).json({ error: rank1Error.message });
    }

    return res.status(200).json({
      ok: true,
      archived: active.id,
      champion: {
        tag: champion.player_tag,
        name: champion.player_name,
        trophies: champion.trophies,
      },
      finalTop10Size: finalPayload.length,
      deckSize: championDeck.length,
    });
  } catch (err) {
    console.error("End-season error:", err);
    return res.status(500).json({ error: err.message });
  }
}
