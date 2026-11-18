import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

test(
  "Hall layout, podium, keyboard tabs, scorer fields, errors and retry",
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
    let failLegends = true,
      failScorers = true,
      quantity = 6,
      emptyScorers = false,
      slow = false;
    let scorerRequests = 0,
      championsStatus = 502,
      failArchive = false;
    const missing = [];
    page.on("response", (res) => {
      if (res.url().startsWith(origin + "/assets/") && res.status() >= 400)
        missing.push(res.url());
    });
    const legends = Array.from({ length: 6 }, (_, i) => ({
      tag: "#TAG" + i,
      name: i === 0 ? "<Ninja>" : "Legend " + i,
      championCount: 6 - i,
      top10Count: 12 - i,
      seasonsWon: Array.from(
        { length: 6 - i },
        (_, j) => "2026-" + String(9 - j).padStart(2, "0"),
      ),
    }));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/champions")
        return route.fulfill(
          failLegends
            ? { status: championsStatus, json: { error: "unavailable" } }
            : { json: { legends: legends.slice(0, quantity) } },
        );
      if (url.pathname === "/api/seasons") {
        if (failArchive)
          return route.fulfill({ status: 502, json: { error: "unavailable" } });
        return route.fulfill({
          json: url.searchParams.has("id")
            ? {
                season: {
                  id: "2026-09",
                  season_champion_tag: "#ARCHIVE",
                  season_champion_name: "Archive champion",
                  final_top_10: [
                    { tag: "#ARCHIVE", name: "Archive champion", rank: 1 },
                    { tag: "#SECOND", name: "Second", rank: 2 },
                  ],
                },
              }
            : { seasons: [{ id: "2026-09", ended_at: "2026-09-28" }] },
        });
      }
      if (url.pathname === "/api/v1/rankings/scorers") {
        scorerRequests++;
        assert.equal(url.searchParams.get("window"), "week");
        assert.equal(url.searchParams.get("limit"), "10");
        if (slow) await new Promise((resolve) => setTimeout(resolve, 200));
        return route.fulfill(
          failScorers
            ? { status: 502, json: { error: "unavailable" } }
            : {
                json: {
                  items: emptyScorers
                    ? []
                    : [
                        {
                          rank: 1,
                          name: "<Gear lord>",
                          tag: "#G1",
                          gears: 957,
                          score: 9999,
                          gearsPerBattle: 1.93,
                          battles: 497,
                          wins: 210,
                          clan: { name: "Brawlers" },
                        },
                        {
                          rank: 2,
                          name: null,
                          tag: "#G2",
                          gears: 900,
                          gearsPerBattle: 2,
                          battles: 450,
                          wins: 190,
                        },
                        {
                          rank: 3,
                          name: "Third Place",
                          tag: "#G3",
                          gears: 850,
                          gearsPerBattle: 2.1,
                          battles: 405,
                          wins: 205,
                        },
                        {
                          rank: 4,
                          name: "Fourth Place",
                          tag: "#G4",
                          gears: 800,
                          gearsPerBattle: 2.25,
                          battles: 355,
                          wins: 180,
                          clan: "Trail Blazers",
                        },
                        {
                          rank: 5,
                          name: "Fifth Place",
                          tag: "#G5",
                          gears: 700,
                          gearsPerBattle: 1.75,
                          battles: 400,
                          wins: 170,
                        },
                      ],
                      windowDays: 7,
                      from: "2026-11-06",
                      to: "2026-11-12",
                      computedAt: "2026-11-12T19:50:52.723597+00:00",
                  },
              },
        );
      }
      if (url.pathname.startsWith("/_vercel/"))
        return route.fulfill({
          body: "",
          contentType: "application/javascript",
        });
      if (url.origin !== origin) return route.abort();
      return route.continue();
    });
    await page.goto(origin + "/champions.html");
    await page.locator("#legends-error").waitFor({ state: "visible" });
    failLegends = false;
    await page.locator("#legends-retry").click();
    await page.locator(".podium-card").first().waitFor();
    assert.equal(await page.locator(".podium-card").count(), 3);
    assert.equal(
      await page.locator(".podium-rank-1 .podium-name").textContent(),
      "<Ninja>",
    );
    assert.equal(await page.locator("#hall-players").textContent(), "6");
    assert.equal(await page.locator("#legends-table-wrap tbody tr").count(), 3);
    assert.deepEqual(
      await page.locator("#legends-table-wrap thead th").allTextContents(),
      ["Rank", "Player", "Season wins", "Top 10 finishes", "Winning seasons"],
    );
    assert.equal(
      await page.locator("#legends-table-wrap tbody tr").first().locator("td").nth(2).textContent(),
      "3×",
    );
    assert.equal(
      await page.locator("#legends-table-wrap tbody tr").first().locator("td").nth(3).textContent(),
      "9×",
    );
    assert.equal(
      await page.evaluate(() => {
        const wrap = document.querySelector("#legends-table-wrap");
        return [3, 4].every((column) => {
          const head = wrap
            .querySelector(`th:nth-child(${column})`)
            .getBoundingClientRect();
          const cell = wrap
            .querySelector(`tbody td:nth-child(${column})`)
            .getBoundingClientRect();
          return Math.abs(head.right - cell.right) < 1;
        });
      }),
      true,
    );
    assert.match(
      await page.locator(".season-chip").first().getAttribute("href"),
      /id=2026-09/,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-champions-desktop.png"),
    });
    await page.locator("#tab-legends").focus();
    await page.keyboard.press("ArrowRight");
    await page.locator("#scorers-error").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#tab-scorers").getAttribute("aria-selected"),
      "true",
    );
    failScorers = false;
    slow = true;
    await page.locator("#scorers-retry").click();
    await page.locator("#tab-legends").click();
    await page.locator("#tab-scorers").click();
    await page.locator("#scorers-content").waitFor({ state: "visible" });
    assert.equal(scorerRequests, 2);
    assert.equal(
      await page
        .locator(".scorer-card--1 .scorer-card-total strong")
        .textContent(),
      "957",
    );
    assert.equal(
      await page
        .locator(".scorer-card--1 .scorer-card-stats > div")
        .nth(0)
        .locator("strong")
        .textContent(),
      "210",
    );
    assert.equal(
      await page.locator("#scorers-podium .scorer-card--2 .p-name").textContent(),
      "#G2",
    );
    assert.equal(
      await page.locator("#scorers-podium .scorer-card--2 .p-tag").count(),
      0,
    );
    const scorerMeta = await page.locator("#scorers-meta").textContent();
    assert.ok(
      scorerMeta.includes("Nov 6, 2026") && scorerMeta.includes("Nov 12, 2026"),
    );
    assert.equal(await page.locator("#scorers-table-wrap tbody tr").count(), 2);
    assert.equal(await page.locator("#scorers-table-wrap .gears-cell").first().textContent(), "800");
    assert.equal(await page.locator("#scorers-table-wrap .battles-cell").first().textContent(), "355");
    assert.equal(await page.locator("#scorers-table-wrap .wins-cell").first().textContent(), "180");
    assert.deepEqual(
      await page.locator("#scorers-table-wrap thead th").allTextContents(),
      ["Rank", "Player", "Clan", "Gears", "Gears / battle", "Battles", "Wins"],
    );
    assert.equal(
      await page.locator("#scorers-table-wrap").evaluate((el) => {
        const head = el
          .querySelector("th:nth-child(4)")
          .getBoundingClientRect();
        const cell = el.querySelector(".gears-cell").getBoundingClientRect();
        return Math.abs(head.right - cell.right) < 1;
      }),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-champions-scorers.png"),
    });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.locator("#scorers-table-wrap").scrollIntoViewIfNeeded();
    assert.equal(
      await page
        .locator("#scorers-table-wrap")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
    );
    assert.equal(
      await page
        .locator("#scorers-table-wrap .gears-cell")
        .first()
        .evaluate((el) => getComputedStyle(el, "::before").content),
      '"Gears"',
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-champions-gears-mobile.png"),
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.locator("#tab-legends").click();
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-champions-mobile.png"),
    });
    await page.locator("#podium").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-champions-podium-mobile.png"),
    });
    quantity = 1;
    await page.reload();
    await page.locator("#legends-content").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#podium").getAttribute("class"),
      "podium solo",
    );
    quantity = 2;
    await page.reload();
    await page.locator("#legends-content").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#podium").getAttribute("class"),
      "podium pair",
    );
    legends.slice(1).forEach((legend) => {
      legend.championCount = 0;
      legend.seasonsWon = [];
    });
    quantity = 6;
    await page.reload();
    await page.locator("#legends-content").waitFor({ state: "visible" });
    assert.equal(await page.locator(".podium-card").count(), 1);
    assert.equal(
      await page.locator(".podium-rank-1 .podium-name").textContent(),
      "<Ninja>",
    );
    assert.equal(await page.locator("#hall-players").textContent(), "1");
    assert.equal(await page.locator("#hall-champions").textContent(), "1");
    assert.equal(
      await page.locator("#legends-table-wrap").isVisible(),
      false,
    );
    quantity = 0;
    emptyScorers = true;
    await page.reload();
    await page.locator("#legends-empty").waitFor({ state: "visible" });
    await page.locator("#tab-scorers").click();
    await page.locator("#scorers-empty").waitFor({ state: "visible" });
    failLegends = true;
    championsStatus = 404;
    await page.reload();
    await page.locator("#legends-content").waitFor({ state: "visible" });
    assert.equal(await page.locator("#hall-players").textContent(), "1");
    assert.equal(await page.locator(".podium-card").count(), 1);
    assert.equal(
      await page.locator(".podium-rank-1 .podium-name").textContent(),
      "Archive champion",
    );
    championsStatus = 503;
    await page.reload();
    await page.locator("#legends-content").waitFor({ state: "visible" });
    failArchive = true;
    await page.reload();
    await page.locator("#legends-error").waitFor({ state: "visible" });
    failArchive = false;
    await page.locator("#legends-retry").click();
    await page.locator("#legends-content").waitFor({ state: "visible" });
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
  },
);
