import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

test(
  "Season archive layout, search, sorting, modal, deep links and recovery",
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
    let failList = false,
      failDetail = false,
      empty = false,
      slow = false;
    const missing = [];
    const seasons = Array.from({ length: 6 }, (_, i) => ({
      id: "2026-" + String(9 - i).padStart(2, "0"),
      ended_at: "2026-" + String(9 - i).padStart(2, "0") + "-28T12:00:00Z",
      season_champion_name: i === 0 ? "<Ninja>" : "Brawler " + i,
      season_champion_tag: "#TAG" + i,
      season_champion_trophies: 9000 - i * 200,
    }));
    const detail = (s) => ({
      ...s,
      final_top_10: Array.from({ length: 10 }, (_, i) => ({
        rank: i + 1,
        name: i === 0 ? s.season_champion_name : "Player " + i,
        tag: "#P" + i,
        trophies: 9000 - i * 100,
        clan: "Brawl crew",
        deck: [
          { displayName: "Big Smith" },
          { displayName: "Bouncy Bomb" },
          { displayName: "Plain Bomb" },
          { displayName: "Core Bomber" },
        ],
      })),
    });
    page.on("response", (r) => {
      if (r.url().startsWith(origin + "/assets/") && r.status() >= 400)
        missing.push(r.url());
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/seasons") {
        const id = url.searchParams.get("id");
        if (id) {
          if (slow) await new Promise((r) => setTimeout(r, 400));
          if (failDetail)
            return route.fulfill({
              status: 503,
              json: { error: "unavailable" },
            });
          return route.fulfill({
            json: {
              season: detail(seasons.find((s) => s.id === id) || seasons[0]),
            },
          });
        }
        if (failList)
          return route.fulfill({ status: 503, json: { error: "unavailable" } });
        return route.fulfill({ json: { seasons: empty ? [] : seasons } });
      }
      if (url.pathname.startsWith("/_vercel/"))
        return route.fulfill({
          body: "",
          contentType: "application/javascript",
        });
      if (url.origin !== origin) return route.abort();
      return route.continue();
    });
    await page.goto(origin + "/season-archive.html");
    await page.locator(".season-card").first().waitFor();
    assert.equal(await page.locator(".season-card").count(), 6);
    assert.match(
      await page.locator(".season-card-month").first().textContent(),
      /September 2026/,
    );
    assert.equal(await page.locator("#archive-count").textContent(), "6");
    assert.equal(await page.locator("#record-trophies").textContent(), "9,000");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-seasons-desktop.png"),
    });
    await page.locator("#archive-search").fill("<Ninja>");
    assert.equal(await page.locator(".season-card").count(), 1);
    assert.equal(
      await page.locator(".champion-meta .name").textContent(),
      "<Ninja>",
    );
    await page.locator("#archive-search").fill("nothing");
    assert.equal(await page.locator(".season-card").count(), 0);
    await page.locator("#archive-search").fill("");
    await page.locator("#archive-sort").selectOption("oldest");
    assert.equal(
      await page.locator(".season-card").first().getAttribute("data-season-id"),
      "2026-04",
    );
    await page.locator("#archive-sort").selectOption("newest");
    await page.locator(".view-standings-btn").first().click();
    await page.locator("#modal-content").waitFor({ state: "visible" });
    assert.equal(await page.locator("#standings-body tr").count(), 10);
    assert.equal(await page.locator("#champion-name").textContent(), "<Ninja>");
    assert.equal(await page.locator("main").evaluate((el) => el.inert), true);
    await page.locator("#modal-close").focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page
        .locator("#standings-body a")
        .last()
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-seasons-modal.png"),
    });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#season-modal").isVisible(), false);
    assert.equal(
      await page
        .locator(".view-standings-btn")
        .first()
        .evaluate((el) => el === document.activeElement),
      true,
    );
    failDetail = true;
    await page.locator(".view-standings-btn").nth(1).click();
    await page.locator("#modal-error").waitFor({ state: "visible" });
    assert.equal(await page.locator("#modal-content").isVisible(), false);
    failDetail = false;
    await page.locator("#modal-retry").click();
    await page.locator("#modal-content").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    slow = true;
    await page.locator(".view-standings-btn").first().click();
    await page.keyboard.press("Escape");
    await page.locator(".view-standings-btn").nth(2).click();
    await page.locator("#modal-content").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#modal-season-id").textContent(),
      "Season 2026-07",
    );
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-seasons-mobile.png"),
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.locator(".view-standings-btn").first().click();
    await page.locator("#modal-content").waitFor({ state: "visible" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.goto(origin + "/season-archive.html?id=2026-08");
    await page.locator("#modal-content").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#modal-season-id").textContent(),
      "Season 2026-08",
    );
    failList = true;
    await page.goto(origin + "/season-archive.html");
    await page.locator("#error-state").waitFor({ state: "visible" });
    failList = false;
    empty = true;
    await page.locator("#archive-retry").click();
    await page.locator("#empty-state").waitFor({ state: "visible" });
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
  },
);
