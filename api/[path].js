import creatorsHandler from "../lib/creators.js";

let redis = null;
let redisInitialized = false;

async function initRedis() {
  if (redisInitialized) return redis;
  redisInitialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.log("Redis env vars missing — skipping rate limiting");
    return null;
  }

  try {
    const { Redis } = await import("@upstash/redis");
    redis = new Redis({ url, token });
    console.log("Redis connected for rate limiting");
  } catch (err) {
    console.error("Redis init failed:", err.message);
    redis = null;
  }
  return redis;
}

const RATE_LIMIT = 60;
const RATE_WINDOW = 60;
const ALLOWED_DOMAINS = ["bbmeta.vercel.app", "localhost", "127.0.0.1"];

export default async function handler(req, res) {
  const requestPath = new URL(req.url, "http://localhost").pathname;
  if (requestPath === "/api/creators") {
    return creatorsHandler(req, res);
  }

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Referrer check
  const referrer = req.headers.referer || req.headers.referrer || "";
  const isAllowed =
    ALLOWED_DOMAINS.some((d) => referrer.includes(d)) || referrer === "";

  if (!isAllowed) {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  // Rate limiting (fails open if Redis unavailable)
  try {
    const client = await initRedis();
    if (client) {
      let ip = "unknown";
      try {
        const raw =
          req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "";
        const str = Array.isArray(raw) ? String(raw[0]) : String(raw);
        ip = str.split(",")[0].trim() || "unknown";
      } catch (e) {
        console.error("IP parse error:", e.message);
      }

      const key = `ratelimit:${ip}`;
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, RATE_WINDOW);

      if (count > RATE_LIMIT) {
        res.setHeader("Retry-After", RATE_WINDOW);
        return res.status(429).json({
          error: "Rate limit exceeded. Try again in a minute.",
        });
      }
    }
  } catch (err) {
    console.error("Rate limit check failed (failing open):", err.message);
  }

  // API key
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API_KEY not configured" });
  }

  // Path rewrite
  let path = req.url;
  if (path.startsWith("/api/")) path = path.substring(4);

  const url = `https://api.badlandbrawl.com${path}`;

  // Cache headers for read-heavy endpoints
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

  // Forward request
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(response.status).json({
        error: "Upstream returned non-JSON",
        raw: text.slice(0, 200),
      });
    }

    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Proxy error: " + error.message });
  }
}
