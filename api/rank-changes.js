import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=300");

  try {
    const { data: latest } = await supabase
      .from("leaderboard_snapshots")
      .select("captured_at")
      .order("captured_at", { ascending: false })
      .limit(1)
      .single();

    if (!latest) {
      return res.status(200).json({ changes: {} });
    }

    const { data: current } = await supabase
      .from("leaderboard_snapshots")
      .select("player_tag, rank, captured_at")
      .eq("captured_at", latest.captured_at);

    const targetTime = new Date(
      new Date(latest.captured_at).getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: previous } = await supabase
      .from("leaderboard_snapshots")
      .select("player_tag, rank, captured_at")
      .lte("captured_at", targetTime)
      .order("captured_at", { ascending: false })
      .limit(10);

    const changes = {};
    for (const curr of current || []) {
      const prev = previous?.find((p) => p.player_tag === curr.player_tag);
      if (prev) {
        changes[curr.player_tag] = prev.rank - curr.rank;
      } else {
        changes[curr.player_tag] = null;
      }
    }

    return res.status(200).json({
      changes,
      comparedAt: previous?.[0]?.captured_at || null,
      currentAt: latest.captured_at,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
