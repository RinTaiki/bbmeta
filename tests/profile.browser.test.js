import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

test(
  "Player showcase preserves achievements, title effects, tooltips, deck and battle controls",
  { timeout: 60000 },
  async (t) => {
    const child = spawn(process.execPath, ["dev-server.js"], {
      cwd: new URL("../", import.meta.url),
      env: { ...process.env, PORT: "0" },
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
      let errors = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(
          /BBmeta dev server: (http:\/\/127\.0\.0\.1:\d+)/,
        );
        if (match) resolve(match[1]);
      });
      child.stderr.on("data", (chunk) => {
        errors += chunk;
      });
      child.once("error", reject);
      child.once("exit", (code) =>
        reject(new Error(`Server exited ${code}: ${errors}`)),
      );
    });
    const browser = await chromium.launch({
      executablePath:
        process.env.BBMETA_BROWSER_PATH ||
        (process.platform === "win32"
          ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
          : undefined),
      headless: true,
    });
    t.after(() => browser.close());
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let decorated = true;
    const missing = [];
    page.on("response", (r) => {
      if (r.url().startsWith(origin + "/assets/") && r.status() >= 400)
        missing.push(r.url());
    });
    const deck = [
      { id: 2, displayName: "Big Smith" },
      { id: 25, displayName: "Bouncy Bomb" },
      { id: 19, displayName: "Plain Bomb" },
      { id: 23, displayName: "Doggos" },
      { id: 29, displayName: "Magnet" },
      { id: 35, displayName: "Balloon" },
      { id: 1, displayName: "Blast Rocket" },
      { id: 44, displayName: "Mini Bomb" },
    ];
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url()),
        p = url.pathname;
      if (p.endsWith("/battlelog"))
        return route.fulfill({
          json: {
            items: [1, 2].map((size, i) => ({
              teamSize: size,
              mode: size === 2 ? "2v2" : "1v1",
              result: i ? "loss" : "win",
              timestamp: new Date().toISOString(),
              durationSeconds: 90,
              score: { player: 3 - i, opponent: i + 1 },
              team: [
                {
                  name: "Arena Legend",
                  tag: "#TEST",
                  trophies: 7350,
                  units: deck,
                },
              ],
              opponent: {
                name: "Challenger",
                tag: "#OTHER",
                trophies: 7200,
                units: deck,
              },
            })),
          },
        });
      if (p === "/api/v1/players/%23TEST")
        return route.fulfill({
          json: {
            tag: "#TEST",
            name: "Arena Legend",
            trophies: 7350,
            expLevel: 31,
            rank: 2,
            bestSeasonRank: 1,
            wins: 600,
            losses: 250,
            clan: { name: "The Badland Collective" },
          },
        });
      if (p === "/api/v1/rankings/players")
        return route.fulfill({
          json: { items: [{ tag: "#TEST", rank: 2, name: "Arena Legend" }] },
        });
      if (p === "/api/player-extras") {
        const type = url.searchParams.get("type");
        return route.fulfill({
          json:
            type === "top10"
              ? {
                  championCount: decorated ? 5 : 0,
                  top10Count: decorated ? 8 : 0,
                  seasons: [
                    { season: "2026-09", rank: 1 },
                    { season: "2026-08", rank: 8 },
                  ],
                }
              : type === "deck"
                ? { deck, source: "current" }
                : {
                    modes: {
                      "1v1": { total: 100, winRate: 68 },
                      "2v2": { total: 100, winRate: 54 },
                      survival: { total: 20, winRate: 40 },
                    },
                  },
        });
      }
      if (p === "/api/season-history")
        return route.fulfill({
          json: {
            totalSeasons: 2,
            championCount: 1,
            bestRank: 1,
            history: [
              { season: "2026-09", rank: 1, trophies: 7377 },
              { season: "2026-08", rank: 8, trophies: 7100 },
            ],
          },
        });
      if (p === "/api/history")
        return route.fulfill({
          json: {
            points: [
              { captured_at: "2026-10-01", trophies: 7100 },
              { captured_at: "2026-10-30", trophies: 7350 },
            ],
          },
        });
      if (p === "/api/seasons") return route.fulfill({ json: { seasons: [] } });
      if (p.startsWith("/_vercel/"))
        return route.fulfill({
          body: "",
          contentType: "application/javascript",
        });
      if (url.origin !== origin) return route.abort();
      return route.continue();
    });
    await page.goto(origin + "/profile.html?tag=%23TEST");
    await page.locator("#profile-content").waitFor({ state: "visible" });
    await page.locator("#achievement-title").waitFor({ state: "visible" });
    await page.locator(".battle-card").first().waitFor();
    assert.equal(
      await page.locator("#player-name").textContent(),
      "Arena Legend",
    );
    assert.equal(
      await page.locator(".player-stat-strip").evaluate((strip) => {
        const tiles = [...strip.querySelectorAll(".stat-tile")];
        return (
          getComputedStyle(strip).gridTemplateColumns.split(" ").length === 5 &&
          tiles.length === 5 &&
          tiles.every((tile) => {
            const style = getComputedStyle(tile);
            return (
              style.display === "flex" &&
              style.flexDirection === "column" &&
              style.textAlign === "center" &&
              Number.parseFloat(
                getComputedStyle(tile.querySelector(".stat-tile-value"))
                  .fontSize,
              ) >= 30
            );
          })
        );
      }),
      true,
    );
    assert.equal(
      await page
        .locator("#win-rate-mode-toggle")
        .evaluate((button) => button.tagName),
      "BUTTON",
    );
    assert.equal(await page.locator("#top10-count").textContent(), "8×");
    assert.equal(await page.locator("#rank1-count").textContent(), "5×");
    assert.equal(
      await page.locator("#achievement-title-text").textContent(),
      "LEGEND",
    );
    assert.equal(await page.locator(".profile-title-embers i").count(), 24);
    assert.equal(await page.locator("#favorite-deck-grid img").count(), 8);
    assert.equal(
      await page.locator("#top10-badge img").getAttribute("src"),
      "assets/icons/seasonegg10.png",
    );
    await page.locator("#top10-badge").focus();
    await page.waitForFunction(
      () =>
        getComputedStyle(
          document.querySelector("#top10-badge .achievement-badge-tooltip"),
        ).opacity === "1",
    );
    assert.equal(
      await page
        .locator("#top10-badge .achievement-badge-tooltip")
        .evaluate((el) => getComputedStyle(el).opacity),
      "1",
    );
    await page.locator("#win-rate-mode-toggle").click();
    assert.equal(await page.locator("#win-rate-mode").textContent(), "2v2");
    assert.equal(await page.locator("#stat-win-rate").textContent(), "54.0%");
    await page.locator('[data-filter="2v2"]').click();
    assert.equal(await page.locator(".battle-card").count(), 1);
    await page.locator('[data-filter="all"]').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-profile-desktop.png"),
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.equal(
      await page.locator(".player-stat-strip").evaluate((strip) => {
        const tiles = [...strip.querySelectorAll(".stat-tile")],
          stripBounds = strip.getBoundingClientRect(),
          first = tiles[0].getBoundingClientRect(),
          last = tiles.at(-1).getBoundingClientRect();
        return (
          tiles.length === 5 &&
          last.width < first.width * 1.1 &&
          Math.abs(
            last.left + last.width / 2 -
              (stripBounds.left + stripBounds.width / 2),
          ) < 2
        );
      }),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-profile-mobile.png"),
    });
    await page.locator("#achievement-badges").scrollIntoViewIfNeeded();
    await page.locator("#top10-badge").focus();
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-profile-accessories-mobile.png"),
    });
    assert.equal(
      await page
        .locator("#top10-badge .achievement-badge-tooltip")
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth;
        }),
      true,
    );
    assert.equal(
      await page.locator("#chart-error").textContent(),
      "The chart could not load. Refresh to try again.",
    );
    decorated = false;
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator("#profile-content").waitFor({ state: "visible" });
    await page.waitForFunction(() =>
      document.querySelector("#favorite-deck-grid img"),
    );
    assert.equal(await page.locator("#achievement-title").isVisible(), false);
    assert.equal(await page.locator("#achievement-badges").isVisible(), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
  },
);
