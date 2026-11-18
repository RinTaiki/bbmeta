import { createClient } from "@supabase/supabase-js";
import { aggregateLegends } from "../js/champion-records.js";
export { aggregateLegends } from "../js/champion-records.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key)
    return res
      .status(503)
      .json({ error: "Champion archive is not configured" });
  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, options = {}) =>
          fetch(input, { ...options, signal: AbortSignal.timeout(15000) }),
      },
    });
    const seasons = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("seasons")
        .select("id, final_top_10, season_champion_tag, season_champion_name")
        .eq("is_current", false)
        .order("ended_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + 999);
      if (error || !Array.isArray(data))
        throw new Error("Archive query failed");
      seasons.push(...data);
      if (data.length < 1000) break;
    }
    const legends = aggregateLegends(seasons);
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    return res.status(200).json({ legends });
  } catch {
    return res
      .status(502)
      .json({ error: "Could not load champion records. Please try again." });
  }
}
