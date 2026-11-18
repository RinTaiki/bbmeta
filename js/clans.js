import { clanBadgePath } from "./clan-badges.js";
const $ = (id) => document.getElementById(id);
let leaderboard = [],
  visible = [],
  view = "leaderboard",
  lastQuery = "",
  listToken = 0,
  modalToken = 0,
  listController,
  modalController,
  activeTag,
  returnFocus,
  previousOverflow;
let listReady = false;
function node(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  if (text != null) el.textContent = String(text);
  return el;
}
function numeric(value) {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function number(value) {
  const n = numeric(value);
  return n == null ? "—" : Math.floor(n).toLocaleString();
}
async function api(path, signal) {
  const response = await fetch("/api" + path, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Clan API " + response.status);
  return response.json();
}
function items(data) {
  const list = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(list)) throw new Error("Invalid clan list");
  return list.filter((item) => item && typeof item === "object");
}
function normalize(item, fallback) {
  return {
    rank: numeric(item.rank) || fallback,
    tag: String(item.tag || ""),
    name: String(item.name || "Unknown clan"),
    score: numeric(item.score ?? item.trophies),
    memberCount: numeric(item.memberCount),
    badge: item.badge,
  };
}
function state(which) {
  ["loading", "error", "empty"].forEach((key) =>
    $("clans-" + key).classList.toggle("hidden", key !== which),
  );
  $("clans-table-wrap").classList.toggle("hidden", which !== "table");
  $("clans-sort").disabled = which !== "table";
  $("clans-tbody").replaceChildren();
  if (which === "loading")
    $("clans-results-count").textContent =
      view === "search" ? "Searching…" : "Loading…";
}
function badgeImage(badge, size = 48) {
  const src = clanBadgePath(badge);
  const fallback = () => node("span", "clans-badge-fallback", "🛡");
  if (!src) return fallback();
  const img = node("img", "clans-badge-icon");
  img.src = src;
  img.alt = "";
  img.width = size;
  img.height = size;
  img.loading = "lazy";
  img.decoding = "async";
  img.addEventListener("error", () => img.replaceWith(fallback()), {
    once: true,
  });
  return img;
}
function summary() {
  $("clan-total").textContent = number(leaderboard.length);
  const scores = leaderboard.map((c) => c.score).filter((n) => n != null),
    members = leaderboard.map((c) => c.memberCount).filter((n) => n != null);
  $("clan-top-score").textContent = scores.length
    ? number(Math.max(...scores))
    : "—";
  $("clan-member-total").textContent = members.length
    ? number(members.reduce((a, b) => a + b, 0))
    : "—";
}
async function loadList(query = "") {
  const token = ++listToken;
  listController?.abort();
  listController = new AbortController();
  listReady = false;
  view = query ? "search" : "leaderboard";
  lastQuery = query;
  $("search-status").classList.toggle("hidden", !query);
  $("search-status-text").textContent = "Search results for “" + query + "”";
  $("clans-section-eyebrow").textContent = query
    ? "TRIBE SEARCH"
    : "THE TOP OF THE BADLANDS";
  $("clans-table-title").textContent = query
    ? "Results for “" + query + "”"
    : "Top Clans";
  state("loading");
  try {
    let data;
    if (!query && leaderboard.length) data = leaderboard;
    else {
      data = items(
        await api(
          query
            ? "/v1/clans/search?name=" + encodeURIComponent(query) + "&limit=20"
            : "/v1/rankings/clans?limit=200",
          listController.signal,
        ),
      )
        .map((item, index) => normalize(item, query ? null : index + 1))
        .filter((clan) => clan.tag);
    }
    if (token !== listToken) return;
    visible = data;
    if (!query) {
      leaderboard = data;
      summary();
    }
    listReady = true;
    render();
  } catch (error) {
    if (token !== listToken) return;
    state("error");
    $("clans-results-count").textContent = "Unavailable";
  }
}
function render() {
  if (!listReady) return;
  state(visible.length ? "table" : "empty");
  $("clans-results-count").textContent =
    visible.length + (view === "search" ? " clans found" : " tribes ranked");
  const order = $("clans-sort").value;
  const sorted = [...visible].sort((a, b) =>
    order === "name"
      ? a.name.localeCompare(b.name)
      : order === "members"
        ? (b.memberCount ?? -1) - (a.memberCount ?? -1)
        : order === "score"
          ? (b.score ?? -1) - (a.score ?? -1)
          : (a.rank ?? Infinity) - (b.rank ?? Infinity),
  );
  const fragment = document.createDocumentFragment();
  sorted.forEach((clan) => {
    const tr = node("tr", "");
    const rankCell = node("td", "clans-col-rank"),
      rank = node(
        "span",
        "clans-rank-badge" +
          ([1, 2, 3].includes(clan.rank) ? " rank-" + clan.rank : ""),
        clan.rank ?? "—",
      );
    rankCell.append(rank);
    const clanCell = node("td", ""),
      wrap = node("div", "clans-clan-cell"),
      info = node("div", "");
    const button = node("button", "clans-clan-name", clan.name);
    button.type = "button";
    button.setAttribute("aria-label", "Open " + clan.name);
    button.addEventListener("click", () => openModal(clan.tag));
    info.append(button, node("span", "clans-clan-tag", clan.tag));
    wrap.append(badgeImage(clan.badge), info);
    clanCell.append(wrap);
    tr.append(
      rankCell,
      clanCell,
      node("td", "clans-col-trophies clans-trophies-cell", number(clan.score)),
      node(
        "td",
        "clans-col-members clans-members-cell",
        number(clan.memberCount),
      ),
    );
    tr.addEventListener("click", (event) => {
      if (!event.target.closest("button")) {
        button.focus();
        openModal(clan.tag);
      }
    });
    fragment.append(tr);
  });
  $("clans-tbody").append(fragment);
}
function modalState(which) {
  ["loading", "error", "content"].forEach((key) =>
    $("clan-modal-" + key).classList.toggle("hidden", which !== key),
  );
  $("clan-modal")
    .querySelector('[role="dialog"]')
    .setAttribute("aria-busy", String(which === "loading"));
}
function backgroundInert(value) {
  document
    .querySelectorAll(".site-header,main,.site-footer")
    .forEach((el) => (el.inert = value));
}
async function openModal(tag) {
  const token = ++modalToken;
  modalController?.abort();
  modalController = new AbortController();
  activeTag = tag;
  const modal = $("clan-modal");
  if (modal.classList.contains("hidden")) {
    returnFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
  }
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  $("clan-modal-name").textContent = "Clan profile";
  modalState("loading");
  document.body.style.overflow = "hidden";
  backgroundInert(true);
  $("clan-modal-close").focus();
  try {
    const [clan, roster] = await Promise.all([
      api("/v1/clans/" + encodeURIComponent(tag), modalController.signal),
      api(
        "/v1/clans/" + encodeURIComponent(tag) + "/members",
        modalController.signal,
      ),
    ]);
    if (token !== modalToken) return;
    if (!clan || typeof clan !== "object" || !clan.tag)
      throw new Error("Invalid clan");
    renderModal(clan, items(roster));
    modalState("content");
  } catch (error) {
    if (token !== modalToken) return;
    modalState("error");
  }
}
function closeModal() {
  const modal = $("clan-modal");
  if (modal.classList.contains("hidden")) return;
  ++modalToken;
  modalController?.abort();
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = previousOverflow;
  backgroundInert(false);
  if (returnFocus?.isConnected) returnFocus.focus();
}
function renderModal(clan, members) {
  const src = clanBadgePath(clan.badge),
    img = $("clan-modal-badge"),
    fallback = $("clan-modal-badge-fallback");
  img.classList.toggle("hidden", !src);
  fallback.classList.toggle("hidden", !!src);
  img.onerror = () => {
    img.classList.add("hidden");
    fallback.classList.remove("hidden");
  };
  if (src) {
    img.src = src;
    img.alt = String(clan.name || "Clan") + " badge";
  } else img.removeAttribute("src");
  $("clan-modal-name").textContent = clan.name || "Unknown clan";
  $("clan-modal-tag").textContent = clan.tag;
  $("clan-modal-trophies").textContent = number(clan.score ?? clan.trophies);
  $("clan-modal-members").textContent = number(
    clan.memberCount ?? members.length,
  );
  $("clan-roster-note").textContent =
    members.length +
    " members in the feed" +
    (numeric(clan.memberCount) > members.length
      ? " · " + number(clan.memberCount) + " in this tribe"
      : "");
  const priority = {
    leader: 0,
    coleader: 1,
    "co-leader": 1,
    elder: 2,
    member: 3,
  };
  const sorted = [...members].sort(
    (a, b) =>
      (numeric(b.trophies) ?? -1) - (numeric(a.trophies) ?? -1) ||
      (priority[String(a.role).toLowerCase()] ?? 4) -
        (priority[String(b.role).toLowerCase()] ?? 4) ||
      String(a.name || "").localeCompare(String(b.name || "")),
  );
  const fragment = document.createDocumentFragment();
  sorted.forEach((member, index) => {
    const row = node(
        "tr",
        index < 3 ? "roster-podium roster-podium-" + (index + 1) : "",
      ),
      player = node("td", "roster-player"),
      link = node(member.tag ? "a" : "span", "", member.name || "Unknown");
    if (member.tag)
      link.href = "profile.html?tag=" + encodeURIComponent(String(member.tag));
    link.append(node("span", "roster-player-tag", member.tag || ""));
    player.append(link);
    const rawRole = String(member.role || "").toLowerCase(),
      roleKey =
        rawRole === "coleader" || rawRole === "co-leader"
          ? "coleader"
          : ["leader", "elder", "member"].includes(rawRole)
            ? rawRole
            : "unknown",
      role =
        roleKey === "coleader"
          ? "Co-leader"
          : roleKey !== "unknown"
            ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1)
            : "—";
    const roleCell = node("td", "roster-role");
    roleCell.append(
      node("span", "roster-role-badge roster-role-" + roleKey, role),
    );
    const rank = node("td", "roster-rank");
    rank.append(node("span", "roster-rank-value", index + 1));
    row.append(
      rank,
      player,
      node("td", "roster-trophies", number(member.trophies)),
      roleCell,
    );
    fragment.append(row);
  });
  if (!sorted.length) {
    const row = node("tr", ""),
      td = node("td", "", "No members are available in this feed.");
    td.colSpan = 4;
    row.append(td);
    fragment.append(row);
  }
  $("clan-modal-roster-body").replaceChildren(fragment);
}
$("clan-search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = $("clan-search-input").value.trim();
  if (query) loadList(query);
});
$("clan-search-input").addEventListener("input", () =>
  $("clan-search-clear").classList.toggle(
    "hidden",
    !$("clan-search-input").value,
  ),
);
function resetSearch() {
  $("clan-search-input").value = "";
  $("clan-search-clear").classList.add("hidden");
  loadList();
  $("clan-search-input").focus();
}
$("clan-search-clear").addEventListener("click", resetSearch);
$("back-to-leaderboard").addEventListener("click", resetSearch);
$("clans-sort").addEventListener("change", render);
$("clans-retry").addEventListener("click", () => loadList(lastQuery));
$("clan-modal-close").addEventListener("click", closeModal);
$("clan-modal-retry").addEventListener("click", () => openModal(activeTag));
$("clan-modal").addEventListener("click", (event) => {
  if (event.target === $("clan-modal")) closeModal();
});
document.addEventListener("keydown", (event) => {
  if ($("clan-modal").classList.contains("hidden")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
  }
  if (event.key === "Tab") {
    const nodes = [
      ...$("clan-modal").querySelectorAll("button,a[href]"),
    ].filter((el) => el.getClientRects().length);
    if (event.shiftKey && document.activeElement === nodes[0]) {
      event.preventDefault();
      nodes.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
      event.preventDefault();
      nodes[0]?.focus();
    }
  }
});
loadList();
