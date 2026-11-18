import { loadArchivedLegends } from "./champion-records.js";
const $ = (id) => document.getElementById(id);
let legendsLoading = false,
  scorersLoading = false,
  scorersLoaded = false;

document.addEventListener("DOMContentLoaded", () => {
  const tabs = [...document.querySelectorAll(".champions-tab")];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", String(active));
        t.tabIndex = active ? 0 : -1;
      });
      document
        .querySelectorAll(".champions-panel")
        .forEach((panel) =>
          panel.classList.toggle(
            "hidden",
            panel.dataset.panel !== tab.dataset.tab,
          ),
        );
      if (tab.dataset.tab === "scorers" && !scorersLoaded) loadScorers();
    });
    tab.addEventListener("keydown", (event) => {
      const next = {
        ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index - 1 + tabs.length) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      }[event.key];
      if (next == null) return;
      event.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    });
  });
  $("legends-retry").addEventListener("click", loadLegends);
  $("scorers-retry").addEventListener("click", loadScorers);
  loadLegends();
});
function escape(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function count(value) {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
function number(value) {
  const n = count(value);
  return n == null ? "—" : n.toLocaleString();
}
function setState(panel, state) {
  ["loading", "empty", "error", "content"].forEach((key) =>
    $(panel + "-" + key).classList.toggle("hidden", key !== state),
  );
  $("panel-" + panel).setAttribute("aria-busy", String(state === "loading"));
}
async function getJSON(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    const error = new Error("Request failed: " + response.status);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
async function loadLegends() {
  if (legendsLoading) return;
  legendsLoading = true;
  setState("legends", "loading");
  try {
    let data;
    try {
      data = await getJSON("/api/champions");
    } catch (error) {
      if (![404, 503].includes(error.status)) throw error;
      data = await loadArchivedLegends(getJSON);
    }
    if (!Array.isArray(data?.legends))
      throw new Error("Invalid champions response");
    const legends = data.legends
      .filter((l) => l && typeof l === "object")
      .map((l) => ({
        name: String(l.name || "Unknown"),
        tag: String(l.tag || ""),
        championCount: count(l.championCount) ?? 0,
        top10Count: count(l.top10Count) ?? 0,
        seasonsWon: Array.isArray(l.seasonsWon)
          ? l.seasonsWon.filter((s) => typeof s === "string")
          : [],
      }))
      .filter((l) => l.championCount > 0)
      .sort(
        (a, b) =>
          b.championCount - a.championCount ||
          b.top10Count - a.top10Count ||
          a.name.localeCompare(b.name),
      );
    $("hall-players").textContent = number(legends.length);
    $("hall-champions").textContent = number(
      legends.filter((l) => l.championCount > 0).length,
    );
    $("hall-titles").textContent = number(
      legends.reduce((n, l) => n + l.championCount, 0),
    );
    if (!legends.length) {
      setState("legends", "empty");
      return;
    }
    renderPodium(legends);
    renderLegendsTable(legends);
    $("legacy-banner").classList.toggle(
      "hidden",
      legends.filter((l) => l.championCount > 0).length >= 3,
    );
    setState("legends", "content");
  } catch {
    setState("legends", "error");
  } finally {
    legendsLoading = false;
    $("panel-legends").setAttribute("aria-busy", "false");
  }
}
function playerHTML(name, tag, className = "player-link") {
  const content =
    '<span class="p-name">' +
    escape(name) +
    "</span>" +
    (tag ? '<span class="p-tag">' + escape(tag) + "</span>" : "");
  return tag
    ? '<a class="' +
        className +
        '" href="profile.html?tag=' +
        encodeURIComponent(tag) +
        '">' +
        content +
        "</a>"
    : '<span class="' + className + '">' + content + "</span>";
}
function renderPodium(legends) {
  const top = legends.slice(0, 3);
  $("podium").classList.toggle("solo", top.length === 1);
  $("podium").classList.toggle("pair", top.length === 2);
  const ordered =
    top.length > 1
      ? [
          { l: top[1], rank: 2 },
          { l: top[0], rank: 1 },
          ...(top[2] ? [{ l: top[2], rank: 3 }] : []),
        ]
      : [{ l: top[0], rank: 1 }];
  $("podium").innerHTML = ordered
    .map(({ l, rank }) => {
      const initial = l.name.trim().charAt(0).toUpperCase() || "?";
      const link = l.tag
        ? '<a class="podium-name" href="profile.html?tag=' +
          encodeURIComponent(l.tag) +
          '">' +
          escape(l.name) +
          "</a>"
        : '<span class="podium-name">' + escape(l.name) + "</span>";
      return (
        '<article class="podium-card podium-rank-' +
        rank +
        '"><span class="podium-rank">#' +
        rank +
        '</span><div class="podium-avatar" aria-hidden="true">' +
        escape(initial) +
        "</div>" +
        link +
        '<span class="podium-tag">' +
        escape(l.tag) +
        '</span><div class="podium-stat"><strong class="podium-stat-number">' +
        number(l.championCount) +
        '×</strong><span class="podium-stat-label">Season wins' +
        '</span></div><p class="podium-sub">' +
        number(l.top10Count) +
        "× Top 10 finishes</p></article>"
      );
    })
    .join("");
}
function table(headers, rows, label, columns = "") {
  return (
    '<table class="legends-table" aria-label="' +
    label +
    '">' +
    columns +
    "<thead><tr>" +
    headers.map((h) => '<th scope="col">' + h + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows +
    "</tbody></table>"
  );
}
function renderLegendsTable(legends) {
  const remaining = legends.slice(3);
  $("legends-table-wrap").classList.toggle("hidden", !remaining.length);
  $("legends-table-wrap").innerHTML = remaining.length
    ? table(
        ["Rank", "Player", "Season wins", "Top 10 finishes", "Winning seasons"],
        remaining
          .map(
            (l, i) =>
              '<tr><td><span class="rank-num">' +
              (i + 4) +
              "</span></td><td>" +
              playerHTML(l.name, l.tag) +
              '</td><td class="num stat-champions" data-label="Season wins">' +
              number(l.seasonsWon.length) +
              '×</td><td class="num stat-top10">' +
              number(l.top10Count) +
              '×</td><td class="winning-seasons">' +
              (l.seasonsWon.length
                ? '<div class="seasons-won">' +
                  l.seasonsWon
                    .map(
                      (s) =>
                        '<a class="season-chip" href="season-archive.html?id=' +
                        encodeURIComponent(s) +
                        '">' +
                        escape(s) +
                        "</a>",
                    )
                    .join("") +
                  "</div>"
                : "—") +
              "</td></tr>",
          )
          .join(""),
        "Champion rankings",
        '<colgroup><col class="col-rank"><col class="col-player"><col class="col-wins"><col class="col-top10"><col class="col-seasons"></colgroup>',
      )
    : "";
}
function scorerPlayerHTML(name, tag) {
  const displayName = name || tag || "Unknown";
  const content =
    '<span class="p-name">' +
    escape(displayName) +
    "</span>" +
    (name && tag ? '<span class="p-tag">' + escape(tag) + "</span>" : "");
  return tag
    ? '<a class="player-link scorer-player-link" href="profile.html?tag=' +
        encodeURIComponent(tag) +
        '">' +
        content +
        "</a>"
    : '<span class="player-link scorer-player-link">' + content + "</span>";
}
function scorerDate(
  value,
  options = { month: "short", day: "numeric", year: "numeric" },
) {
  if (typeof value !== "string") return "";
  const input = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value + "T12:00:00"
    : value;
  const date = new Date(input);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, options).format(date);
}
function scorerRate(value) {
  if (value == null || value === "" || typeof value === "boolean") return "—";
  const n = Number(value);
  return Number.isFinite(n) && n >= 0
    ? n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";
}
function renderScorerPodium(items) {
  const podium = $("scorers-podium");
  const leaders = items.slice(0, 3);
  podium.dataset.count = String(leaders.length);
  podium.innerHTML = leaders
    .map((item) => {
      const label = item.name || item.tag || "Unknown";
      const clan = item.clan
        ? '<span class="scorer-card-clan">' + escape(item.clan) + "</span>"
        : '<span class="scorer-card-clan">Clan not listed</span>';
      return (
        '<article class="scorer-card scorer-card--' +
        item.rank +
        '" aria-label="Rank ' +
        item.rank +
        ", " +
        escape(label) +
        ", " +
        number(item.gears) +
        ' gears"><span class="scorer-medal">#' +
        item.rank +
        '</span><div class="scorer-card-player">' +
        scorerPlayerHTML(item.name, item.tag) +
        clan +
        '</div><div class="scorer-card-total"><strong>' +
        number(item.gears) +
        '</strong><span>GEARS SCORED</span></div><div class="scorer-card-stats"><div><strong>' +
        number(item.wins) +
        '</strong><span>Wins</span></div><div><strong>' +
        number(item.battles) +
        '</strong><span>Battles</span></div><div><strong>' +
        scorerRate(item.gearsPerBattle) +
        '</strong><span>Gears / battle</span></div></div></article>'
      );
    })
    .join("");
}
function renderScorerStandings(items) {
  const remaining = items.slice(3);
  const wrap = $("scorers-table-wrap");
  $("scorers-standings").classList.toggle("hidden", !remaining.length);
  wrap.innerHTML = remaining.length
    ? table(
        ["Rank", "Player", "Clan", "Gears", "Gears / battle", "Battles", "Wins"],
        remaining
          .map(
            (item) =>
              '<tr><td class="scorer-rank"><span class="rank-num">' +
              item.rank +
              '</span></td><td class="scorer-player">' +
              scorerPlayerHTML(item.name, item.tag) +
              '</td><td class="clan-cell" data-label="Clan">' +
              escape(item.clan || "—") +
              '</td><td class="num gears-cell" data-label="Gears">' +
              number(item.gears) +
              '</td><td class="num gears-rate-cell" data-label="Gears / battle">' +
              scorerRate(item.gearsPerBattle) +
              '</td><td class="num battles-cell" data-label="Battles">' +
              number(item.battles) +
              '</td><td class="num wins-cell" data-label="Wins">' +
              number(item.wins) +
              "</td></tr>",
          )
          .join(""),
        "Weekly gear scorers",
        '<colgroup><col class="col-rank"><col class="col-player"><col class="col-clan"><col class="col-gears"><col class="col-rate"><col class="col-battles"><col class="col-wins"></colgroup>',
      )
    : "";
}
function renderScorerMeta(data, countPlayers) {
  const from = scorerDate(data.from);
  const to = scorerDate(data.to);
  const days = count(data.windowDays);
  const period =
    from && to
      ? from + " – " + to
      : days
        ? "Last " + number(days) + " days"
        : "Weekly ranking";
  const updated = scorerDate(data.computedAt, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  $("scorers-meta").innerHTML =
    '<div class="scorers-meta-window"><span>SCORING WINDOW</span><strong>' +
    escape(period) +
    '</strong></div><div class="scorers-meta-details"><span>' +
    escape(
      (days ? number(days) + "-day ranking" : "Weekly ranking") +
        " · " +
        number(countPlayers) +
        (countPlayers === 1 ? " player" : " players"),
    ) +
    "</span>" +
    (updated ? "<span>Updated " + escape(updated) + "</span>" : "") +
    "</div>";
}
async function loadScorers() {
  if (scorersLoading) return;
  scorersLoading = true;
  setState("scorers", "loading");
  try {
    const data = await getJSON("/api/v1/rankings/scorers?window=week&limit=10");
    const raw = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(raw)) throw new Error("Invalid scorers response");
    const items = raw
      .filter((item) => item && typeof item === "object")
      .map((item, index) => {
        const rank = count(item.rank);
        const rawClan =
          item.clan?.name ||
          (typeof item.clan === "string" ? item.clan : item.clanName) ||
          "";
        return {
          rank: rank && rank > 0 ? rank : index + 1,
          name: String(item.name || item.playerName || "").trim(),
          tag: String(item.tag || "").trim(),
          clan: String(rawClan).trim(),
          gears: count(item.gears ?? item.goals),
          gearsPerBattle: item.gearsPerBattle ?? item.goalsPerBattle,
          battles: count(item.battles ?? item.battlesPlayed),
          wins: count(item.wins),
        };
      })
      .filter((item) => item.gears != null && (item.tag || item.name))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 10);
    scorersLoaded = true;
    if (!items.length) {
      setState("scorers", "empty");
      return;
    }
    renderScorerMeta(data, items.length);
    renderScorerPodium(items);
    renderScorerStandings(items);
    setState("scorers", "content");
  } catch {
    setState("scorers", "error");
  } finally {
    scorersLoading = false;
    $("panel-scorers").setAttribute("aria-busy", "false");
  }
}
