import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id } = req.query;

    if (id) {
      return await getSeasonDetail(res, String(id));
    }
    return await listSeasons(res);
  } catch (err) {
    console.error("[api/seasons] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function listSeasons(res) {
  const { data, error } = await supabase
    .from("seasons")
    .select(
      "id, ended_at, season_champion_tag, season_champion_name, season_champion_trophies",
    )
    .eq("is_current", false)
    .order("ended_at", { ascending: false });

  if (error) {
    console.error("[api/seasons] listSeasons supabase error:", error);
    return res.status(500).json({ error: "Failed to fetch seasons" });
  }

  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  return res.status(200).json({ seasons: data || [] });
}

async function getSeasonDetail(res, id) {
  const { data, error } = await supabase
    .from("seasons")
    .select(
      "id, ended_at, is_current, season_champion_tag, season_champion_name, season_champion_trophies, final_top_10",
    )
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return res.status(404).json({ error: "Season not found" });
    }
    console.error("[api/seasons] getSeasonDetail supabase error:", error);
    return res.status(500).json({ error: "Failed to fetch season" });
  }

  if (!data) {
    return res.status(404).json({ error: "Season not found" });
  }

  let finalTop10 = data.final_top_10 || [];
  if (typeof finalTop10 === "string") {
    try {
      finalTop10 = JSON.parse(finalTop10);
    } catch {
      finalTop10 = [];
    }
  }

  const season = {
    id: data.id,
    ended_at: data.ended_at,
    season_champion_tag: data.season_champion_tag,
    season_champion_name: data.season_champion_name,
    season_champion_trophies: data.season_champion_trophies,
    final_top_10: finalTop10,
  };

  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  return res.status(200).json({ season });
}