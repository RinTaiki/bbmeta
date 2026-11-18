import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

test(
  "leaderboard desktop, mobile, filtering, failures, and stale requests",
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
    let failRankings = false;
    let delayGermany = false;
    let delayProfile = false;
    let noGames = false;
    let emptyRankings = false;
    let releaseProfile;
    let profileStarted;
    const profileGate = new Promise((resolve) => {
      releaseProfile = resolve;
    });
    const startedGate = new Promise((resolve) => {
      profileStarted = resolve;
    });
    const players = Array.from({ length: 60 }, (_, index) => ({
      rank: index + 1,
      tag: index === 0 ? "#SAME" : `#P${index}`,
      name:
        index === 0
          ? "Arena Champion"
          : index === 1
            ? "<img src=x onerror=alert(1)>"
            : `Brawler ${index + 1}`,
      trophies: String(18000 - index * 40),
      clan: {
        name: "Badland Legends",
        ...(index === 0 ? { badge: { id: 10, file: "10.png" } } : {}),
      },
    }));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes("/api/v1/rankings/players")) {
        if (failRankings)
          return route.fulfill({ status: 500, json: { error: "unavailable" } });
        if (emptyRankings) return route.fulfill({ json: { items: [] } });
        const country = url.searchParams.get("country");
        if (country === "DE" && delayGermany)
          await new Promise((resolve) => setTimeout(resolve, 250));
        return route.fulfill({
          json: {
            items: country
              ? [
                  {
                    rank: 1,
                    tag: "#SAME",
                    name: `${country} Champion`,
                    trophies: 17000,
                    clan: "Regional Legends",
                  },
                ]
              : players,
          },
        });
      }
      if (url.pathname.includes("/api/v1/players/")) {
        if (noGames)
          return route.fulfill({
            json: { wins: 0, losses: 0, currentDeck: [] },
          });
        if (
          delayProfile &&
          decodeURIComponent(url.pathname).endsWith("#SAME")
        ) {
          delayProfile = false;
          profileStarted();
          await profileGate;
          return route.fulfill({
            json: { wins: 99, losses: 1, currentDeck: [{ id: 1 }] },
          });
        }
        return route.fulfill({
          json: {
            recentWins: "3",
            recentLosses: "1",
            currentDeck: [{ name: "Bouncy Bomb" }, { name: "Plain Bomb" }],
          },
        });
      }
      if (url.pathname === "/api/rank-changes")
        return route.fulfill({ json: { changes: { "#SAME": 2 } } });
      if (url.pathname === "/assets/badges/010.png")
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>',
        });
      if (url.pathname.startsWith("/_vercel/"))
        return route.fulfill({
          body: "",
          contentType: "application/javascript",
        });
      if (url.hostname !== "127.0.0.1") return route.abort();
      return route.continue();
    });
    await page.goto(`${origin}/leaderboard.html`);
    await page.waitForFunction(
      () => document.querySelectorAll("#leaderboard-body tr").length === 50,
    );
    assert.equal(await page.locator(".podium-card").count(), 3);
    assert.equal(await page.locator("#arena-count").textContent(), "60");
    assert.equal(
      await page.locator(".col-player .player-name").nth(1).textContent(),
      "<img src=x onerror=alert(1)>",
    );
    assert.equal(await page.locator(".col-player .player-name img").count(), 0);
    assert.equal(
      await page
        .locator("#leaderboard-body .col-clan")
        .first()
        .locator(".clan-badge-icon")
        .getAttribute("src"),
      "assets/badges/010.png",
    );
    assert.equal(
      await page
        .locator("#leaderboard-body .col-clan")
        .nth(2)
        .locator(".clan-badge-fallback")
        .textContent(),
      "🛡️",
    );
    console.log("Desktop rendering and escaping passed");
    const background = await page.evaluate(
      () => getComputedStyle(document.body, "::before").backgroundImage,
    );
    assert.match(background, /frozen_dawn.webp/);
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".rankings-panel"))
            .backdropFilter,
      ),
      "none",
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-leaderboard-desktop.png"),
      fullPage: false,
    });
    await page.locator(".player-name").first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-leaderboard-table.png"),
      fullPage: false,
    });
    await page.locator("#search-input").fill("brawler 12");
    await page.waitForFunction(
      () => document.querySelectorAll("#leaderboard-body tr").length === 1,
    );
    await page.selectOption("#country-filter", "DE");
    await page.waitForFunction(
      () => document.querySelector("#arena-count").textContent === "1",
    );
    assert.equal(await page.locator("#empty-state").isVisible(), true);
    assert.equal(
      await page.locator("#search-input").inputValue(),
      "brawler 12",
    );
    await page.locator("#clear-search-btn").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#leaderboard-body tr").length === 1,
    );
    assert.equal(
      await page.locator(".player-name").textContent(),
      "DE Champion",
    );
    assert.equal(await page.locator(".rank-change").count(), 0);
    console.log("Country filtering preserves search");
    await page.selectOption("#country-filter", "");
    await page.waitForFunction(
      () => document.querySelectorAll("#leaderboard-body tr").length === 50,
    );
    await page.locator("#load-more-btn").click();
    assert.equal(await page.locator("#leaderboard-body tr").count(), 60);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const before = page.url();
    await page.locator(".copy-tag-btn").first().focus();
    await page.keyboard.press("Enter");
    assert.equal(page.url(), before);
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "#SAME",
    );
    await page.setViewportSize({ width: 360, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    console.log("Pagination, keyboard copy, and mobile layout passed");
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-leaderboard-mobile.png"),
      fullPage: false,
    });
    await page.evaluate(() => localStorage.clear());
    delayGermany = true;
    await page.selectOption("#country-filter", "DE");
    await page.selectOption("#country-filter", "FR");
    await page.waitForFunction(
      () =>
        document.querySelector(".player-name")?.textContent === "FR Champion",
    );
    await page.waitForTimeout(400);
    assert.equal(
      await page.locator(".player-name").textContent(),
      "FR Champion",
    );
    console.log("Latest country request wins");
    await page.evaluate(() => localStorage.clear());
    delayProfile = true;
    await page.selectOption("#country-filter", "");
    await page.waitForFunction(
      () => document.querySelectorAll("#leaderboard-body tr").length === 50,
    );
    await page.locator(".player-name").first().scrollIntoViewIfNeeded();
    await Promise.race([
      startedGate,
      new Promise((_, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Delayed profile request never started")),
          10000,
        );
        timeout.unref();
      }),
    ]);
    await page.selectOption("#country-filter", "JP");
    await page.waitForFunction(
      () =>
        document.querySelector(".player-name")?.textContent === "JP Champion",
    );
    releaseProfile();
    await page.waitForFunction(
      () => document.querySelector(".winrate-value")?.textContent === "75.0%",
    );
    assert.equal(await page.locator(".winrate-value").textContent(), "75.0%");
    // Denied browser storage must not crash module initialization.
    await page.addInitScript(() =>
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Storage blocked", "SecurityError");
        },
      }),
    );
    failRankings = true;
    await page.reload();
    await page.waitForSelector("#error-state:not(.hidden)");
    assert.equal(await page.locator("#table-container").isVisible(), false);
    assert.equal(await page.locator("#podium-section").isVisible(), false);
    await page.locator("#search-input").fill("test");
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#error-state").isVisible(), true);
    failRankings = false;
    await page.locator("#search-input").fill("");
    await page.locator("#retry-btn").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#leaderboard-body tr").length === 50,
    );
    noGames = true;
    await page.selectOption("#country-filter", "US");
    await page.waitForFunction(
      () =>
        document.querySelector(".player-name")?.textContent === "US Champion",
    );
    await page.locator(".player-name").first().scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () => document.querySelector(".winrate-value")?.textContent === "—",
    );
    assert.equal(await page.locator(".deck-unavailable").textContent(), "—");
    emptyRankings = true;
    await page.selectOption("#country-filter", "GB");
    await page.waitForSelector("#empty-state:not(.hidden)");
    assert.equal(await page.locator("#podium-section").isVisible(), false);
    assert.equal(
      await page.locator("#pagination-container").isVisible(),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      `Screenshots: ${path.join(tmpdir(), "bbmeta-leaderboard-desktop.png")} and mobile.png`,
    );
  },
);
