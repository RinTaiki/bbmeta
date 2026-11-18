const PLACEHOLDER = "assets/backgrounds/canyon_dawn.webp";

function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function videoLink(className, videoId) {
  const link = element("a", className);
  link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function creatorCard(creator, video) {
  const hasVideo = video && /^[\w-]{11}$/.test(video.videoId);
  const name =
    String(creator.channelName || "Community Creator").trim() ||
    "Community Creator";
  const card = element("article", "creator-card");
  const header = element("div", "creator-header");
  const avatar = element("img", "creator-avatar");
  avatar.alt = name;
  avatar.width = avatar.height = 48;
  avatar.loading = "lazy";
  avatar.onerror = () => {
    const fallback = element(
      "span",
      "creator-avatar creator-avatar-fallback",
      Array.from(name)[0].toUpperCase(),
    );
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", name);
    avatar.replaceWith(fallback);
  };
  const avatarUrl = safeImageUrl(creator.avatarUrl);
  if (avatarUrl) avatar.src = avatarUrl;
  const info = element("div", "creator-info");
  info.append(
    element("h3", "creator-name", name),
    element("span", "creator-badge", "Creator"),
  );
  header.append(avatar, info);
  if (!avatarUrl) avatar.onerror();

  const link = hasVideo
    ? videoLink("creator-video-link", video.videoId)
    : element("div", "creator-video-link");
  const videoFrame = element("div", "creator-video");
  const thumbnail = element("img", "video-thumbnail");
  thumbnail.alt = "";
  thumbnail.loading = "lazy";
  thumbnail.onerror = () => {
    thumbnail.onerror = () => {
      thumbnail.hidden = true;
    };
    thumbnail.src = PLACEHOLDER;
  };
  thumbnail.src = (hasVideo && safeImageUrl(video.thumbnailUrl)) || PLACEHOLDER;
  const overlay = element("span", "video-play-overlay", "▶");
  overlay.setAttribute("aria-hidden", "true");
  videoFrame.append(thumbnail);
  if (hasVideo) videoFrame.append(overlay);
  link.append(
    videoFrame,
    element(
      "p",
      "video-title",
      hasVideo
        ? video.title || "Watch the latest video"
        : "No videos available yet",
    ),
  );
  card.append(header, link);
  if (!hasVideo) return card;
  const button = videoLink("creator-watch-btn", video.videoId);
  button.textContent = "Watch on YouTube →";
  button.setAttribute("aria-label", `Watch ${name} on YouTube`);
  card.append(button);
  return card;
}

export async function loadCreators() {
  const section = document.getElementById("creators-section");
  const grid = document.getElementById("creators-grid");
  if (!section || !grid) return;
  section.style.display = "none";
  try {
    const response = await fetch("/api/creators", {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return;
    const data = await response.json();
    const creators = Array.isArray(data.creators)
      ? data.creators.filter(
          (creator) => creator && typeof creator === "object",
        )
      : [];
    const cards = creators.flatMap((creator) => {
      const seen = new Set();
      const videos = (Array.isArray(creator.videos) ? creator.videos : [])
        .filter((video) => {
          if (
            !video ||
            !/^[\w-]{11}$/.test(video.videoId) ||
            seen.has(video.videoId)
          )
            return false;
          seen.add(video.videoId);
          return true;
        })
        .slice(0, 2);
      return (videos.length ? videos : [null]).map((video) =>
        creatorCard(creator, video),
      );
    });
    if (!cards.length) return;
    section.style.setProperty("--creator-columns", Math.min(cards.length, 4));
    grid.replaceChildren(...cards);
    section.style.display = "block";
  } catch {
    section.style.display = "none";
  }
}
