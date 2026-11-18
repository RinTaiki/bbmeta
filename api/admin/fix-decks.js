import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const authHeader = req.headers.authorization || "";
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { season_id } = req.body || {};
  if (!season_id) return res.status(400).json({ error: "season_id required" });

  try {
    // 1. Fetch the season
    const { data: season, error: fetchErr } = await supabase
      .from("seasons")
      .select("id, final_top_10")
      .eq("id", season_id)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!season) return res.status(404).json({ error: "Season not found" });

    const top10 = season.final_top_10 || [];
    if (top10.length === 0) {
      return res.status(400).json({ error: "Season has no final_top_10" });
    }

    // 2. Fetch decks, names, and trophies for each player
    const apiKey = process.env.API_KEY;
    const playerData = {};

    await Promise.all(
      top10.map(async (p) => {
        try {
          const r = await fetch(
            `https://api.badlandbrawl.com/v1/players/${encodeURIComponent(p.tag)}`,
            { headers: { Authorization: `Bearer ${apiKey}` } },
          );
          const profile = await r.json();
          playerData[p.tag] = {
            deck: profile.currentDeck || [],
            name: profile.name || p.name,
            trophies: profile.trophies || p.trophies,
          };
        } catch (e) {
          console.error(`Fetch failed for ${p.tag}:`, e.message);
          playerData[p.tag] = { deck: [], name: p.name, trophies: p.trophies };
        }
      }),
    );

    // 3. Merge decks, names, and trophies into the archived top 10
    const updated = top10.map((p) => ({
      ...p,
      name: playerData[p.tag]?.name || p.name,
      trophies: playerData[p.tag]?.trophies || p.trophies,
      deck: playerData[p.tag]?.deck || [],
    }));

    const { error: updateErr } = await supabase
      .from("seasons")
      .update({ final_top_10: updated })
      .eq("id", season_id);

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    const withDecks = Object.values(playerData).filter((p) => p.deck.length > 0).length;

    return res.status(200).json({
      ok: true,
      season_id,
      total_players: top10.length,
      decks_fetched: withDecks,
      players: updated.map((p) => ({
        rank: p.rank,
        name: p.name,
        tag: p.tag,
        deck_size: p.deck.length,
      })),
    });
  } catch (err) {
    console.error("fix-decks error:", err);
    return res.status(500).json({ error: err.message });
  }
}
