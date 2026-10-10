import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import creatorsHandler from "./api/creators.js";

const root = path.dirname(fileURLToPath(import.meta.url));
// Match local Vercel environment files without exposing their contents.
for (const filename of [".env.local", ".env"]) {
  try {
    loadEnvFile(path.join(root, filename));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const host = "127.0.0.1";
const port = Number(process.env.PORT || 3002);
const apiOrigin = process.env.BBMETA_API_ORIGIN || "https://bbmeta.vercel.app";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${host}:${port}`);

  if (requestUrl.pathname === "/api/creators") {
    // Adapt Node's response to the response helpers used by Vercel functions.
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(body));
      return res;
    };
    await creatorsHandler(req, res);
    return;
  }

  const isApiRequest =
    requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/");
  const isVercelScript =
    requestUrl.pathname.startsWith("/_vercel/") &&
    requestUrl.pathname.endsWith("/script.js");

  if (requestUrl.pathname.startsWith("/_vercel/") && req.method === "POST") {
    res.writeHead(204).end();
    return;
  }

  if (isApiRequest || isVercelScript) {
    await proxyApiRequest(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  let filePath = path.resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    if ((await stat(filePath)).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    const contents = await readFile(filePath);
    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type":
        mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(req.method === "HEAD" ? undefined : contents);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

async function proxyApiRequest(req, res) {
  if (req.method !== "GET") {
    res
      .writeHead(405, { Allow: "GET" })
      .end("Only read-only API requests are proxied");
    return;
  }

  try {
    const upstream = await fetch(new URL(req.url, apiOrigin), {
      headers: {
        accept: req.headers.accept || "application/json",
        ...(req.headers.referer ? { referer: req.headers.referer } : {}),
      },
    });
    const responseHeaders = {};
    for (const name of ["cache-control", "content-type", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders[name] = value;
    }
    res.writeHead(upstream.status, responseHeaders);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error("API proxy failed:", error);
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Development API proxy failed" }));
  }
}

server.listen(port, host, () => {
  console.log(`BBmeta dev server: http://${host}:${server.address().port}`);
  console.log(`Read-only API proxy: ${apiOrigin}`);
});
