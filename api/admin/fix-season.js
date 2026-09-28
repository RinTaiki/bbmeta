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
    return res.status(405).json({ error: "Use POST to fix a season" });
  }

  const authHeader = req.headers.authorization || "";
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { season_id, final_top_10, update_champion } = req.body || {};

  if (!season_id) {
    return res.status(400).json({ error: "season_id is required" });
  }

  if (!Array.isArray(final_top_10) || final_top_10.length === 0) {
    return res
      .status(400)
      .json({ error: "final_top_10 must be a non-empty array" });
  }

  // Validate each entry has required fields
  for (const entry of final_top_10) {
    if (
      typeof entry.rank !== "number" ||
      !entry.tag ||
      typeof entry.trophies !== "number"
    ) {
      return res.status(400).json({
        error: "Each entry needs rank (number), tag, trophies (number)",
      });
    }
    // Allow empty names but normalize them
    if (!entry.name || !entry.name.trim()) {
      entry.name = "\u3164"; // Invisible character fallback
    }
  }

  // Ensure sorted by rank
  const sorted = [...final_top_10].sort((a, b) => a.rank - b.rank);

  // Normalize each entry
  const normalized = sorted.map((e) => ({
    rank: e.rank,
    tag: e.tag.startsWith("#") ? e.tag : `#${e.tag}`,
    name: e.name,
    trophies: e.trophies,
    clan: e.clan || null,
    deck: e.deck || [],
  }));

  try {
    // 1. Fetch the season to confirm it exists
    const { data: existing, error: fetchError } = await supabase
      .from("seasons")
      .select("id, season_champion_tag")
      .eq("id", season_id)
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    if (!existing) {
      return res.status(404).json({ error: `Season ${season_id} not found` });
    }

    // 2. Build the update object
    const update = {
      final_top_10: normalized,
    };

    // 3. Optionally update champion fields (if rank 1 changed)
    const champion = normalized.find((e) => e.rank === 1);
    let championChanged = false;

    if (update_champion !== false && champion) {
      if (existing.season_champion_tag !== champion.tag) {
        championChanged = true;
        update.season_champion_tag = champion.tag;
        update.season_champion_name = champion.name;
        update.season_champion_trophies = champion.trophies;
      }
    }

    // 4. Update the season row
    const { error: updateError } = await supabase
      .from("seasons")
      .update(update)
      .eq("id", season_id);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // 5. If champion changed, fix the rank1_finishes record too
    let rank1Fixed = false;
    if (championChanged && champion) {
      // Delete old champion record for this season
      await supabase.from("rank1_finishes").delete().eq("season", season_id);

      // Insert new champion
      const { error: r1Error } = await supabase.from("rank1_finishes").insert({
        player_tag: champion.tag,
        player_name: champion.name,
        season: season_id,
        trophies: champion.trophies,
      });

      if (!r1Error) rank1Fixed = true;
    }

    return res.status(200).json({
      ok: true,
      season_id,
      entries_updated: normalized.length,
      champion_changed: championChanged,
      champion: champion
        ? {
            tag: champion.tag,
            name: champion.name,
            trophies: champion.trophies,
          }
        : null,
      rank1_finish_updated: rank1Fixed,
    });
  } catch (err) {
    console.error("fix-season error:", err);
    return res.status(500).json({ error: err.message });
  }
}
