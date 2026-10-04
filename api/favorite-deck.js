export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  let { tag } = req.query;
  if (!tag) return res.status(400).json({ error: "Missing tag" });

  tag = "#" + String(tag).replace(/^#+/, "").toUpperCase();

  const apiKey = process.env.API_KEY;

  try {
    // 1. Fetch battle log
    const battleRes = await fetch(
      `https://api.badlandbrawl.com/v1/players/${encodeURIComponent(tag)}/battlelog?limit=50`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const battleData = await battleRes.json();
    const battles = battleData.items || [];

    // 2. Extract decks by mode
    const oneVsOne = [];
    const twoVsTwo = [];

    for (const b of battles) {
      const units = b.team?.[0]?.units || [];
      if (units.length !== 8) continue;

      const deckKey = units.map((u) => u.id || u.displayName).sort().join("|");
      const deck = units.map((u) => ({
        id: u.id,
        displayName: u.displayName || u.name,
        level: u.level,
      }));

      const mode = b.mode || (b.teamSize === 2 ? "2v2" : "1v1");
      const is2v2 = mode === "2v2" || b.teamSize === 2;

      if (is2v2) twoVsTwo.push({ key: deckKey, deck });
      else oneVsOne.push({ key: deckKey, deck });
    }

    // 3. Find most common
    function mostCommon(list) {
      if (list.length === 0) return null;
      const counts = {};
      for (const item of list) {
        counts[item.key] = counts[item.key] || { count: 0, deck: item.deck };
        counts[item.key].count++;
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
      const [topKey, topVal] = sorted[0];
      return {
        deck: topVal.deck,
        matchCount: topVal.count,
        totalMatches: list.length,
      };
    }

    let result = mostCommon(oneVsOne);
    let source = "1v1";

    if (!result || result.matchCount < 2) {
      const alt = mostCommon(twoVsTwo);
      if (alt && alt.matchCount >= 2) {
        result = alt;
        source = "2v2";
      }
    }

    // 4. Fallback to currentDeck
    if (!result) {
      const profileRes = await fetch(
        `https://api.badlandbrawl.com/v1/players/${encodeURIComponent(tag)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      const profile = await profileRes.json();
      result = {
        deck: (profile.currentDeck || []).map((u) => ({
          id: u.id,
          displayName: u.displayName || u.name,
          level: u.level,
        })),
        matchCount: 0,
        totalMatches: 0,
      };
      source = "current";
    }

    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1200");
    return res.status(200).json({
      tag,
      source,
      deck: result.deck,
      matchCount: result.matchCount,
      totalMatches: result.totalMatches,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}