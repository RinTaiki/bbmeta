import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

test(
  "dev server executes creators locally and preserves other API proxy routes",
  { timeout: 15000 },
  async (t) => {
    const upstreamRequests = [];
    const cachedAt = new Date().toISOString();
    const upstream = createServer((req, res) => {
      upstreamRequests.push(req.url);
      res.setHeader("Content-Type", "application/json");
      if (req.url.startsWith("/rest/v1/creators?")) {
        res.end(
          JSON.stringify([
            {
              id: 1,
              channel_id: "UCtest",
              channel_name: "NinjaX Play",
              channel_url: "https://www.youtube.com/@Ninjaxplay7",
            },
          ]),
        );
      } else if (req.url.startsWith("/rest/v1/creator_cache?")) {
        res.end(
          JSON.stringify({
            channel_id: "UCtest",
            channel_name: "NinjaX Play",
            latest_video_id: "abcdefghijk",
            latest_video_title: "Cached video",
            videos: Array.from({ length: 5 }, (_, index) => ({
              videoId: `video${String(index).padStart(6, "0")}`,
              title: `Cached video ${index + 1}`,
              thumbnailUrl: null,
              publishedAt: cachedAt,
            })),
            cached_at: cachedAt,
          }),
        );
      } else {
        res.end(JSON.stringify({ proxied: true }));
      }
    });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    t.after(() => new Promise((resolve) => upstream.close(resolve)));
    const origin = `http://127.0.0.1:${upstream.address().port}`;
    const child = spawn(process.execPath, ["dev-server.js"], {
      cwd: new URL("../", import.meta.url),
      env: {
        ...process.env,
        PORT: "0",
        SUPABASE_URL: origin,
        SUPABASE_SERVICE_KEY: "test-key",
        BBMETA_API_ORIGIN: origin,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let serverErrors = "";
    t.after(async () => {
      if (child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
    });
    const localOrigin = await new Promise((resolve, reject) => {
      let output = "";
      child.stderr.on("data", (chunk) => {
        serverErrors += chunk;
      });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(
          /BBmeta dev server: (http:\/\/127\.0\.0\.1:\d+)/,
        );
        if (match) resolve(match[1]);
      });
      child.once("error", reject);
      child.once("exit", (code) =>
        reject(new Error(`Dev server exited: ${code}\n${serverErrors}`)),
      );
    });
    const response = await fetch(`${localOrigin}/api/creators`);
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("cache-control"),
      "public, s-maxage=3600",
    );
    const body = await response.json();
    assert.equal(
      body.creators[0]?.channelName,
      "NinjaX Play",
      `${serverErrors}\n${upstreamRequests.join("\n")}`,
    );
    assert.equal(body.creators[0].latestVideoTitle, "Cached video");
    assert.equal(body.creators[0].videos.length, 5);
    assert.equal(body.creators[0].videos[4].title, "Cached video 5");
    const rejected = await fetch(`${localOrigin}/api/creators`, {
      method: "POST",
    });
    assert.equal(rejected.status, 405);
    assert.equal(rejected.headers.get("allow"), "GET");
    const proxied = await fetch(`${localOrigin}/api/history`);
    assert.deepEqual(await proxied.json(), { proxied: true });
  },
);

test(
  "dev server proxies creators when local database credentials are absent",
  { timeout: 15000 },
  async (t) => {
    const calls = [];
    const creators = [
      {
        channelName: "NinjaX Play",
        videos: [{ videoId: "abcdefghijk", title: "Latest video" }],
      },
    ];
    const upstream = createServer((req, res) => {
      calls.push(req.url);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ creators }));
    });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    t.after(() => new Promise((resolve) => upstream.close(resolve)));
    const child = spawn(process.execPath, ["dev-server.js"], {
      cwd: new URL("../", import.meta.url),
      env: {
        ...process.env,
        PORT: "0",
        SUPABASE_URL: "",
        SUPABASE_SERVICE_KEY: "",
        BBMETA_API_ORIGIN: "http://127.0.0.1:" + upstream.address().port,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    t.after(async () => {
      if (child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
    });
    const origin = await new Promise((resolve, reject) => {
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(
          /BBmeta dev server: (http:\/\/127\.0\.0\.1:\d+)/,
        );
        if (match) resolve(match[1]);
      });
      child.once("error", reject);
      child.once("exit", (code) =>
        reject(new Error("Dev server exited " + code)),
      );
    });
    const response = await fetch(origin + "/api/creators");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { creators });
    assert.deepEqual(calls, ["/api/creators"]);
  },
);
