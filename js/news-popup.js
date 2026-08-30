import { NEWS_ITEMS } from "./news.js";

const STORAGE_KEY = "bbmeta_news_read";

function getReadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function setReadState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Unable to save news read state", e);
  }
}

function getUnreadCount() {
  const readState = getReadState();
  return NEWS_ITEMS.filter((item) => !readState[item.id]).length;
}

function updateBadge() {
  const badgeEl = document.getElementById("news-unread-badge");
  if (!badgeEl) return;
  const count = getUnreadCount();
  if (count > 0) {
    badgeEl.textContent = count;
    badgeEl.style.display = "inline-block";
  } else {
    badgeEl.style.display = "none";
  }
}

function markAllAsRead() {
  const readState = getReadState();
  NEWS_ITEMS.forEach((item) => {
    readState[item.id] = true;
  });
  setReadState(readState);
  updateBadge();
}

function renderNewsList() {
  const container = document.getElementById("news-popup-list");
  if (!container) return;

  container.innerHTML = NEWS_ITEMS.map(
    (item) => `
    <article class="news-item">
      <div class="meta">
        <span class="tag">${item.tag}</span>
        <time class="date">${item.date}</time>
      </div>
      <h3>${item.title}</h3>
      <p>${item.content}</p>
    </article>
  `,
  ).join("");
}

function initNewsPopup() {
  const button = document.getElementById("news-trigger-btn");
  const overlay = document.getElementById("news-popup-overlay");
  const closeBtn = document.getElementById("news-close-btn");

  if (!button || !overlay) return;

  renderNewsList();
  updateBadge();

  const openPopup = () => {
    overlay.classList.add("active");
    markAllAsRead();
  };

  const closePopup = () => {
    overlay.classList.remove("active");
  };

  button.addEventListener("click", openPopup);
  if (closeBtn) closeBtn.addEventListener("click", closePopup);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closePopup();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) {
      closePopup();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initNewsPopup);
} else {
  initNewsPopup();
}
