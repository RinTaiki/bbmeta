import { showNotification } from "./notifications.js";
import { loadCreators } from "./creators.js";

document.addEventListener("DOMContentLoaded", () => {
  void loadCreators();
  const form = document.getElementById("search-form");
  const input = document.getElementById("player-tag-input");
  if (!form || !input) return;
  input.addEventListener("input", () => input.setCustomValidity(""));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!/^#?[a-z0-9]+$/i.test(value)) {
      input.setCustomValidity(
        "Enter your player tag using letters and numbers, with an optional #.",
      );
      input.reportValidity();
      input.focus();
      return;
    }
    const tag = "#" + value.replace(/^#/, "").toUpperCase();
    showNotification(`Searching for ${tag}…`, "info");
    window.location.assign(`profile.html?tag=${encodeURIComponent(tag)}`);
  });
});
