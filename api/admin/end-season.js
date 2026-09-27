import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

/**
 * Compute the next season ID from the current one.
 * Example: "2026-09" → "2026-10", "2026-12" → "2027-01"
 */
function getNextSeasonId(currentId) {
  const [year, month] = currentId.split("-").map(Number);
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  const adminSecret = process.env.ADMIN_SECRET;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST to end a season" });
  }

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 1. Find active season
    const { data: active } = await supabase
      .from("seasons")
      .select("*")
      .eq("is_current", true)
      .maybeSingle();

    if (!active) {
      return res.status(400).json({ error: "No active season to end" });
    }

    // 2. Get final Top 10
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

    // 3. Determine champion
    const champion = finalTop10.find((p) => p.rank === 1);
    if (!champion) {
      return res.status(400).json({ error: "No rank 1 in final top 10" });
    }

    // 4. Fetch champion's deck
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

    // 6. Record #1 finish
    const { error: rank1Error } = await supabase.from("rank1_finishes").insert({
      player_tag: champion.player_tag,
      player_name: champion.player_name,
      season: active.id,
      trophies: champion.trophies,
    });

    if (rank1Error && rank1Error.code !== "23505") {
      return res.status(500).json({ error: rank1Error.message });
    }

    // 7. Auto-create next season
    const nextSeasonId = getNextSeasonId(active.id);
    const { error: nextSeasonError } = await supabase.from("seasons").insert({
      id: nextSeasonId,
      started_at: new Date().toISOString(),
      is_current: true,
    });

    if (nextSeasonError) {
      console.error("Next season insert failed:", nextSeasonError);
      // Don't fail the whole request — archive succeeded
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
      nextSeason: nextSeasonId,
    });
  } catch (err) {
    console.error("End-season error:", err);
    return res.status(500).json({ error: err.message });
  }
}
