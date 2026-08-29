import { showNotification } from "./notifications.js";

document.addEventListener("DOMContentLoaded", () => {
  const searchForm = document.getElementById("search-form");
  const playerTagInput = document.getElementById("player-tag-input");

  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();

      let tag = playerTagInput.value.trim();

      if (!tag) {
        showNotification("Please enter a valid player tag.", "warning");
        return;
      }

      
      if (!tag.startsWith("#")) {
        tag = "#" + tag;
      }

      showNotification(`Searching for ${tag}...`, "info");

      
      setTimeout(() => {
        window.location.href = `profile.html?tag=${encodeURIComponent(tag)}`;
      }, 600);
    });
  }
});
