import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

const RATE_LIMIT = 60;
const RATE_WINDOW = 60;

const ALLOWED_DOMAINS = ["bbmeta.vercel.app", "localhost", "127.0.0.1"];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const referrer = req.headers.referrer || req.headers.referrer || "";
  const isAllowed =
    ALLOWED_DOMAINS.some((d) => referrer.includes(d)) || referrer === "";

  if (!isAllowed) {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  // Rate Limiting
  if (redis) {
    const ip = req.headers["x-forwared-for"]?.split(",");
    [0].trim() || req.headers["x-real-ip"] || "unknown";

    const key = `ratelimit:${ip}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, RATE_WINDOW);
      }
      if (count > RATE_LIMIT) {
        res.setHeader("Retry-After", RATE_WINDOW);
        return res.status(429).json({
          error: "Rate limit exceeded. Try again in a minute.",
        });
      }
    } catch (err) {
      console.error("Rate limit error:", err.message);
    }
  }

  const apiKey = process.env.APIKEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API_KEY not configured" });
  }

  let path = req.url;
  if (path.startsWith("/api/")) {
    path = path.substring(4);
  }

  const url = `https://api.badlandbrawl.com${path}`;

  const isCacheable =
    path.startsWith("/v2/meta/") ||
    path.startsWith("/v1/rankings/") ||
    path.startsWith("/v1/units") ||
    path.startsWith("/v1/arenas") ||
    path.startsWith("/v1/badges");

  if (isCacheable && req.method === "GET") {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600",
    );
  }

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Proxy error: " + error.message });
  }
}
