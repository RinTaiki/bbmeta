function tagOf(value) {
  if (typeof value !== "string") return "";
  const tag = value.trim().replace(/^#+/, "").toUpperCase();
  return /^[A-Z0-9]+$/.test(tag) ? "#" + tag : "";
}

// Count each player once per archived season, even if a snapshot has duplicate rows.
export function aggregateLegends(seasons) {
  const players = new Map(),
    seenSeasons = new Set();
  for (const season of seasons) {
    if (!season || season.id == null || seenSeasons.has(String(season.id)))
      continue;
    const seasonId = String(season.id);
    seenSeasons.add(seasonId);
    let entries = season.final_top_10;
    if (typeof entries === "string") {
      try {
        entries = JSON.parse(entries);
      } catch {
        entries = [];
      }
    }
    const finishers = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || typeof entry !== "object") continue;
      const tag = tagOf(entry.tag),
        rank = Number(entry.rank);
      if (!tag || !Number.isInteger(rank) || rank < 1 || rank > 10) continue;
      const prior = finishers.get(tag);
      if (!prior || rank < prior.rank)
        finishers.set(tag, { name: String(entry.name || "Unknown"), rank });
    }
    const recordedChampion = tagOf(season.season_champion_tag);
    const winner =
      recordedChampion ||
      [...finishers].find(([, entry]) => entry.rank === 1)?.[0];
    if (recordedChampion) {
      const name =
        season.season_champion_name ||
        finishers.get(recordedChampion)?.name ||
        "Unknown";
      finishers.set(recordedChampion, { name: String(name), rank: 1 });
    }
    for (const [tag, entry] of finishers) {
      const player = players.get(tag) || {
        tag,
        name: entry.name,
        championCount: 0,
        top10Count: 0,
        seasonsWon: [],
      };
      if (player.name === "Unknown" && entry.name !== "Unknown")
        player.name = entry.name;
      player.top10Count++;
      if (tag === winner) {
        player.championCount++;
        player.seasonsWon.push(seasonId);
      }
      players.set(tag, player);
    }
  }
  return [...players.values()]
    .map((player) => ({
      ...player,
      seasonsWon: player.seasonsWon.sort().reverse(),
    }))
    .sort(
      (a, b) =>
        b.championCount - a.championCount ||
        b.top10Count - a.top10Count ||
        a.name.localeCompare(b.name) ||
        a.tag.localeCompare(b.tag),
    );
}

// Reuse public archive snapshots when the dedicated endpoint is not available yet.
export async function loadArchivedLegends(getJSON) {
  const data = await getJSON("/api/seasons");
  if (!Array.isArray(data?.seasons)) throw new Error("Invalid season archive");
  const seasons = [
    ...new Map(
      data.seasons
        .filter((s) => s && s.id != null)
        .map((s) => [String(s.id), s]),
    ).values(),
  ].sort((a, b) =>
    String(b.ended_at || b.id).localeCompare(String(a.ended_at || a.id)),
  );
  const records = new Array(seasons.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, seasons.length) }, async () => {
      while (next < seasons.length) {
        const index = next++,
          id = String(seasons[index].id);
        const detail = await getJSON(
          "/api/seasons?id=" + encodeURIComponent(id),
        );
        if (!detail?.season || String(detail.season.id) !== id)
          throw new Error("Invalid season snapshot");
        records[index] = detail.season;
      }
    }),
  );
  return { legends: aggregateLegends(records) };
}
