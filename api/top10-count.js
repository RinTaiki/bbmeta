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

  let { tag } = req.query;
  if (!tag) return res.status(400).json({ error: "Missing tag" });

  tag = "#" + String(tag).replace(/^#+/, "").toUpperCase();

  try {
    const { data: seasons, error } = await supabase
      .from("seasons")
      .select("id, final_top_10, season_champion_tag")
      .eq("is_current", false);

    if (error) return res.status(500).json({ error: error.message });

    let top10Count = 0;
    let championCount = 0;
    const seasonsList = [];

    for (const s of seasons || []) {
      let top10 = s.final_top_10 || [];
      if (typeof top10 === "string") {
        try {
          top10 = JSON.parse(top10);
        } catch {
          top10 = [];
        }
      }
      const entry = top10.find((p) => p.tag?.toUpperCase() === tag);
      if (entry) {
        top10Count++;
        if (entry.rank === 1) championCount++;
        seasonsList.push({ season: s.id, rank: entry.rank });
      }
    }

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    return res.status(200).json({
      tag,
      top10Count,
      championCount,
      seasons: seasonsList,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
