
const TITLES = {
  success: "Nice!",
  error: "Oops!",
  warning: "Heads up!",
  info: "King says:",
};


const ICONS = {
  success: { img: "assets/emotes/king-celebration.png", fallback: "✓" },
  error: { img: "assets/emotes/blastbot-alarm.png", fallback: "!" },
  warning: { glyph: "▲" },
  info: { img: "assets/king/leadertip.png", fallback: "i" },
};


let containerEl = null;

function getContainer() {
  if (containerEl && document.documentElement.contains(containerEl))
    return containerEl;


  containerEl = document.getElementById("notification-container");
  if (!containerEl) {
    containerEl = document.createElement("div");
    containerEl.id = "notification-container";
    containerEl.className = "toast-container";
    document.documentElement.appendChild(containerEl);
  } else if (containerEl.parentElement !== document.documentElement) {
    document.documentElement.appendChild(containerEl);
  }
  return containerEl;
}

export function showNotification(message, type = "info", duration = 3500) {
  const container = getContainer();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "status");


  const iconData = ICONS[type] || ICONS.info;
  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.setAttribute("aria-hidden", "true");

  if (iconData.img) {
    icon.classList.add("toast-icon--img");
    const img = document.createElement("img");
    img.className = "toast-icon-img";
    img.src = iconData.img;
    img.alt = "";
    img.onerror = () => {
      icon.classList.remove("toast-icon--img");
      icon.textContent = iconData.fallback || "i";
    };
    icon.appendChild(img);
  } else {
    icon.textContent = iconData.glyph;
  }

  const body = document.createElement("div");
  body.className = "toast-body";

  const titleSpan = document.createElement("span");
  titleSpan.className = "toast-title";
  titleSpan.textContent = TITLES[type] || TITLES.info;

  const messageSpan = document.createElement("span");
  messageSpan.className = "toast-message";
  messageSpan.textContent = message;

  body.appendChild(titleSpan);
  body.appendChild(messageSpan);

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  closeBtn.textContent = "×";

  const progress = document.createElement("span");
  progress.className = "toast-progress";

  toast.appendChild(icon);
  toast.appendChild(body);
  toast.appendChild(closeBtn);
  toast.appendChild(progress);
  container.appendChild(toast);

  
  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  let dismissTimer = null;
  let removed = false;

  const dismiss = () => {
    if (removed) return;
    removed = true;
    if (dismissTimer) clearTimeout(dismissTimer);
    toast.classList.remove("toast-visible");
    toast.classList.add("toast-dismissing");

    
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      toast.remove();
    };
    toast.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 400);
  };

  closeBtn.addEventListener("click", dismiss);

  
  if (duration > 0) {
    dismissTimer = setTimeout(dismiss, duration);
    
    progress.style.transitionDuration = `${duration}ms`;
    requestAnimationFrame(() => {
      progress.style.transform = "scaleX(0)";
    });
  } else {
    progress.style.display = "none";
  }

  return dismiss;
}
