import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import handler, { aggregateLegends } from "../api/champions.js";

const seasons = [
  {
    id: "2026-09",
    season_champion_tag: "#aaa",
    season_champion_name: "Latest name",
    final_top_10: JSON.stringify([
      { tag: " aaa ", name: "Old name", rank: "1" },
      { tag: "#AAA", rank: 1 },
      { tag: "#BBB", name: "Second", rank: 2 },
      { tag: "#BAD", rank: 11 },
      { tag: "#EVIL", rank: "<img>" },
    ]),
  },
  {
    id: "2026-08",
    final_top_10: [
      { tag: "#AAA", name: "Older name", rank: 1 },
      { tag: "#BBB", name: "Second", rank: "2" },
      null,
    ],
  },
  {
    id: "2026-07",
    season_champion_tag: "#CCC",
    season_champion_name: "Third",
    final_top_10: "broken JSON",
  },
];
test("champion aggregation handles string ranks, normalized tags, duplicates, invalid snapshots and champion-only seasons", () => {
  const legends = aggregateLegends([...seasons, seasons[0]]);
  assert.deepEqual(legends, [
    {
      tag: "#AAA",
      name: "Latest name",
      championCount: 2,
      top10Count: 2,
      seasonsWon: ["2026-09", "2026-08"],
    },
    {
      tag: "#CCC",
      name: "Third",
      championCount: 1,
      top10Count: 1,
      seasonsWon: ["2026-07"],
    },
    {
      tag: "#BBB",
      name: "Second",
      championCount: 0,
      top10Count: 2,
      seasonsWon: [],
    },
  ]);
});
test("handler imports without configuration and rejects unsupported methods", async () => {
  const prior = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_KEY,
  };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  function response() {
    return {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      status(n) {
        this.statusCode = n;
        return this;
      },
      json(v) {
        this.body = v;
        return this;
      },
      end() {
        return this;
      },
    };
  }
  try {
    let res = response();
    await handler({ method: "GET" }, res);
    assert.equal(res.statusCode, 503);
    res = response();
    await handler({ method: "POST" }, res);
    assert.equal(res.statusCode, 405);
    res = response();
    await handler({ method: "OPTIONS" }, res);
    assert.equal(res.statusCode, 204);
  } finally {
    if (prior.url == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prior.url;
    if (prior.key == null) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = prior.key;
  }
});
test(
  "local Champions route queries Supabase and scorer route proxies the weekly feed",
  { timeout: 30000 },
  async (t) => {
    let fail = false;
    const paths = [];
    const upstream = createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      paths.push(url);
      res.setHeader("Content-Type", "application/json");
      if (url.pathname === "/rest/v1/seasons") {
        assert.equal(url.searchParams.get("is_current"), "eq.false");
        assert.match(url.searchParams.get("select"), /season_champion_tag/);
        assert.equal(req.headers.apikey, "fixture-service-key");
        res.writeHead(fail ? 500 : 200);
        res.end(
          JSON.stringify(
            fail ? { message: "Database details must not leak" } : seasons,
          ),
        );
        return;
      }
      res.end(
        JSON.stringify({
          items: [{ rank: 1, tag: "#AAA", gears: 957, battles: 497 }],
        }),
      );
    });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    t.after(() => new Promise((resolve) => upstream.close(resolve)));
    const fixtureOrigin = "http://127.0.0.1:" + upstream.address().port;
    const child = spawn(process.execPath, ["dev-server.js"], {
      cwd: new URL("../", import.meta.url),
      env: {
        ...process.env,
        PORT: "0",
        SUPABASE_URL: fixtureOrigin,
        SUPABASE_SERVICE_KEY: "fixture-service-key",
        BBMETA_API_ORIGIN: fixtureOrigin,
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
      let text = "";
      child.stdout.on("data", (chunk) => {
        text += chunk;
        const match = text.match(
          /BBmeta dev server: (http:\/\/127\.0\.0\.1:\d+)/,
        );
        if (match) resolve(match[1]);
      });
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error("Server exited " + code)));
    });
    const res = await fetch(origin + "/api/champions");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("cache-control"), /s-maxage=300/);
    assert.equal((await res.json()).legends[0].championCount, 2);
    const scorers = await fetch(
      origin + "/api/v1/rankings/scorers?window=week&limit=10",
    );
    assert.equal(scorers.status, 200);
    assert.equal((await scorers.json()).items[0].gears, 957);
    assert.equal(paths.at(-1).searchParams.get("window"), "week");
    fail = true;
    const error = await fetch(origin + "/api/champions");
    assert.equal(error.status, 502);
    assert.equal(error.headers.get("cache-control"), null);
    assert.doesNotMatch(await error.text(), /Database details/);
  },
);
