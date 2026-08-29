export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API_KEY not configured" });
  }

  // Strip the '/api' prefix from the request path
  let path = req.url;
  if (path.startsWith("/api/")) {
    path = path.substring(4); // remove '/api'
  }
  // path now starts with '/v1/...' or '/v2/...'

  const url = `https://api.badlandbrawl.com${path}`;

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
