import { createClient } from "@supabase/supabase-js";

const CACHE_TTL = 24 * 60 * 60 * 1000;
const VIDEO_LIMIT = 5;

async function youtube(resource, params) {
  if (!process.env.YOUTUBE_API_KEY) throw new Error("YouTube unavailable");
  const query = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${resource}?${query}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("YouTube request failed");
  const data = await response.json();
  if (data.error) throw new Error("YouTube request failed");
  return data.items || [];
}

function channelLookup(channelUrl) {
  const url = new URL(channelUrl);
  if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
    throw new Error("Unsupported channel URL");
  }
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0]?.startsWith("@")) return { forHandle: parts[0] };
  if (parts[0] === "channel" && parts[1]) return { id: parts[1] };
  if (parts[0] === "user" && parts[1]) return { forUsername: parts[1] };
  throw new Error("Unsupported channel URL");
}

function thumbnail(snippet) {
  return snippet?.thumbnails?.high?.url || snippet?.thumbnails?.medium?.url || snippet?.thumbnails?.default?.url || null;
}

async function getCreator(supabase, creator) {
  let channelId = creator.channel_id;
  let channel;
  if (!channelId) {
    [channel] = await youtube("channels", {
      part: "snippet,contentDetails", ...channelLookup(creator.channel_url),
    });
    if (!channel?.id) return null;
    channelId = channel.id;
    const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
    // The supplied schema omits uploads_playlist_id; support it without requiring a migration.
    let saved = await supabase.from("creators").update({
      channel_id: channelId, uploads_playlist_id: uploads,
    }).eq("id", creator.id);
    if (saved.error && ["PGRST204", "42703"].includes(saved.error.code)) {
      saved = await supabase.from("creators").update({ channel_id: channelId }).eq("id", creator.id);
    }
    if (saved.error) throw new Error("Channel persistence failed");
  }

  const { data: cached, error } = await supabase.from("creator_cache")
    .select("*").eq("channel_id", channelId).maybeSingle();
  if (error) throw new Error("Cache read failed");
  const age = Date.now() - Date.parse(cached?.cached_at);
  let cache = cached;
  if (!cache?.videos?.length || !Number.isFinite(age) || age < 0 || age >= CACHE_TTL) {
    if (!channel) {
      [channel] = await youtube("channels", { part: "snippet,contentDetails", id: channelId });
    }
    const uploads = channel?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) return null;
    const playlistItems = await youtube("playlistItems", {
      part: "snippet", playlistId: uploads, maxResults: String(VIDEO_LIMIT),
    });
    const videos = playlistItems
      .map(({ snippet }) => ({
        videoId: snippet?.resourceId?.videoId,
        title: snippet?.title,
        thumbnailUrl: thumbnail(snippet),
        publishedAt: snippet?.publishedAt || null,
      }))
      .filter((video) => video.videoId)
      .slice(0, VIDEO_LIMIT);
    if (!videos.length) return null;
    cache = {
      channel_id: channelId,
      channel_name: channel.snippet?.title || creator.channel_name,
      avatar_url: thumbnail(channel.snippet),
      videos,
      latest_video_id: videos[0].videoId,
      latest_video_title: videos[0].title,
      latest_video_thumbnail: videos[0].thumbnailUrl,
      latest_video_published: videos[0].publishedAt,
      cached_at: new Date().toISOString(),
    };
    const { error: writeError } = await supabase.from("creator_cache").upsert(cache, { onConflict: "channel_id" });
    if (writeError) throw new Error("Cache write failed");
  }
  const videos = Array.isArray(cache.videos) ? cache.videos.slice(0, VIDEO_LIMIT) : [];
  if (!videos.length) return null;
  return {
    channelId, channelName: creator.channel_name || cache.channel_name,
    channelUrl: creator.channel_url, avatarUrl: cache.avatar_url,
    latestVideoId: cache.latest_video_id, latestVideoTitle: cache.latest_video_title,
    latestVideoThumbnail: cache.latest_video_thumbnail, videos,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  try {
    const missingConfig = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"].filter((name) => !process.env[name]);
    if (missingConfig.length) {
      throw new Error(`Missing required environment variables: ${missingConfig.join(", ")}`);
    }
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.from("creators")
      .select("id,channel_url,channel_id,channel_name,display_order")
      .eq("approved", true).order("display_order", { ascending: true }).order("id", { ascending: true });
    if (error) throw new Error("Creators unavailable");
    const creators = [];
    // Limit concurrent upstream calls while preserving database order.
    for (let offset = 0; offset < data.length; offset += 4) {
      const results = await Promise.allSettled(data.slice(offset, offset + 4).map((creator) => getCreator(supabase, creator)));
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) creators.push(result.value);
        else if (result.status === "rejected") {
          console.error("Creator lookup failed:", result.reason instanceof Error ? result.reason.message : "Unknown error");
        }
      }
    }
    return res.status(200).json({ creators });
  } catch (error) {
    console.error("Creators API failed:", error instanceof Error ? error.message : "Unknown error");
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ creators: [] });
  }
}
