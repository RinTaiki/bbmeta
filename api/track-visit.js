import { createClient } from "@supabase/supabase-js";
import { errors } from "@upstash/redis";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Header", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use Post" });

  const { tag, rank, trophies, exp_Level } = req.body || {};

  if (!tag) return res.status(400).json({ error: "tag required" });

  let normalized = "#" + String(tag).replace(/^#+/, "").toUpperCase();

  try {
    const oneHourAgo = new Data(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: recent } = await supabase
      .from("player_snapshots")
      .select("id")
      .eq("player_tag", normalized)
      .gte("captured_at", oneHourAgo)
      .limit(1)
      .maybeSingle();

    if (recent) {
      return res
        .status(200)
        .json({ ok: true, skipped: true, reason: "recent snapshot exists" });
    }

    const { error } = await supabase.from("player_snapshots").insert({
      player_tag: normalized,
      rank: rank ?? null,
      trophies: trophies ?? null,
      exp_Level: exp_Level ?? null,
      source: "profile_visit",
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true, inserted: true, tag: normalized });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
