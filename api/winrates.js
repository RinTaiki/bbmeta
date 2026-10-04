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

  const apiKey = process.env.API_KEY;

  try {
    const battleRes = await fetch(
      `https://api.badlandbrawl.com/v1/players/${encodeURIComponent(tag)}/battlelog?limit=50`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const battleData = await battleRes.json();
    const battles = battleData.items || [];

    const modes = {
      "1v1": { wins: 0, losses: 0, total: 0 },
      "2v2": { wins: 0, losses: 0, total: 0 },
      survival: { wins: 0, losses: 0, total: 0 },
    };

    for (const b of battles) {
      const mode = (b.mode || "").toLowerCase();
      const teamSize = b.teamSize || 1;

      let bucket = null;
      if (mode === "survival") bucket = "survival";
      else if (mode === "2v2" || teamSize === 2) bucket = "2v2";
      else bucket = "1v1";

      const isWin = b.result === "win" || b.win === true;
      modes[bucket].total++;
      if (isWin) modes[bucket].wins++;
      else modes[bucket].losses++;
    }

    const result = {};
    for (const [name, m] of Object.entries(modes)) {
      result[name] = {
        wins: m.wins,
        losses: m.losses,
        total: m.total,
        winRate:
          m.total > 0 ? Number(((m.wins / m.total) * 100).toFixed(1)) : null,
      };
    }

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    return res.status(200).json({ tag, modes: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
