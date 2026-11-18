import { NEWS_ITEMS } from "./news.js";

const STORAGE_KEY = "bbmeta_news_read";
function getReadState() {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return state && typeof state === "object" && !Array.isArray(state)
      ? state
      : {};
  } catch {
    return {};
  }
}
function markAllAsRead() {
  const state = getReadState();
  NEWS_ITEMS.forEach((item) => (state[item.id] = true));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* News remains usable when browser storage is disabled. */
  }
}
function updateBadge(button) {
  const count = NEWS_ITEMS.filter((item) => !getReadState()[item.id]).length;
  const badge = document.getElementById("news-unread-badge");
  badge.textContent = String(count);
  badge.style.display = count ? "inline-grid" : "none";
  button.setAttribute(
    "aria-label",
    "Open News Feed" + (count ? ", " + count + " unread updates" : ""),
  );
}
function sortedNews(order) {
  return [...NEWS_ITEMS].sort((a, b) => {
    const difference =
      (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) ||
      Number(b.id) - Number(a.id);
    return order === "oldest" ? -difference : difference;
  });
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}
function renderNewsList(order) {
  const list = document.getElementById("news-popup-list");
  const latest = sortedNews("latest")[0]?.id;
  const fragment = document.createDocumentFragment();
  sortedNews(order).forEach((item) => {
    const article = element(
      "article",
      "news-item" + (item.id === latest ? " is-latest" : ""),
    );
    article.dataset.kind = String(item.tag).toLowerCase();
    const meta = element("div", "meta");
    const time = element("time", "date", item.date);
    const date = new Date(item.date);
    if (!Number.isNaN(date.getTime()))
      time.dateTime = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
    meta.append(element("span", "tag", item.tag));
    if (item.id === latest)
      meta.append(element("span", "news-latest-pill", "Latest"));
    meta.append(time);
    article.append(
      meta,
      element("h3", "", item.title),
      element("p", "", item.content),
    );
    fragment.append(article);
  });
  if (!NEWS_ITEMS.length)
    fragment.append(
      element("p", "news-empty", "No updates just yet. Check back soon."),
    );
  list.replaceChildren(fragment);
  list.scrollTop = 0;
  document.getElementById("news-count").textContent =
    NEWS_ITEMS.length + " update" + (NEWS_ITEMS.length === 1 ? "" : "s");
}
function initNewsPopup() {
  const button = document.getElementById("news-trigger-btn");
  const overlay = document.getElementById("news-popup-overlay");
  const closeButton = document.getElementById("news-close-btn");
  if (!button || !overlay || !closeButton) return;
  let order = "latest",
    returnFocus,
    previousOverflow;
  const inertState = new Map();
  updateBadge(button);
  renderNewsList(order);
  document.querySelectorAll(".news-sort-btn").forEach((sort) => {
    sort.addEventListener("click", () => {
      order = sort.dataset.sort === "oldest" ? "oldest" : "latest";
      document.querySelectorAll(".news-sort-btn").forEach((other) => {
        const active = other === sort;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-pressed", String(active));
      });
      renderNewsList(order);
    });
  });
  function open() {
    if (!overlay.hidden) return;
    returnFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    overlay.hidden = false;
    overlay.classList.add("active");
    button.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    [...document.body.children]
      .filter(
        (el) =>
          el !== overlay && !["SCRIPT", "STYLE", "LINK"].includes(el.tagName),
      )
      .forEach((el) => {
        inertState.set(el, el.inert);
        el.inert = true;
      });
    closeButton.focus();
    markAllAsRead();
    updateBadge(button);
  }
  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    overlay.classList.remove("active");
    button.setAttribute("aria-expanded", "false");
    document.body.style.overflow = previousOverflow;
    inertState.forEach((value, el) => (el.inert = value));
    inertState.clear();
    if (returnFocus?.isConnected) returnFocus.focus();
  }
  button.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = [
      ...overlay.querySelectorAll('button,a[href],[tabindex="0"]'),
    ].filter((el) => !el.disabled && el.getClientRects().length);
    const first = nodes[0],
      last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) updateBadge(button);
  });
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", initNewsPopup);
else initNewsPopup();
