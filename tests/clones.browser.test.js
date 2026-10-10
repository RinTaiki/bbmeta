import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

test(
  "clone collection layout, filters, statistics, modal, and failure recovery",
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
    let fail = false;
    let empty = false;
    let slowTop = false;
    let special = false;
    const requests = [];
    const fixtures = [
      [25, "Bouncy Bomb"],
      [2, "Big Smith"],
      [5, "Bomb Golem"],
      [26, "Big Frost"],
      [1, "Blast Rocket"],
      [42, "Core Bomber"],
      [92, "Overseer"],
      [19, "Plain Bomb"],
      [23, "Doggos"],
      [30, "Bomb Spider"],
      [35, "Balloon"],
      [78, "Electromancer"],
      [90, "Grand Trickster"],
      [49, "Healing Bottle"],
      [55, "Big Bouncy Bomb"],
      [3, "Spiky"],
    ].map(([id, name], index) => ({
      unitId: id,
      displayName: name,
      usageRate: (40 - index * 2) / 100,
      winRate: index === 0 ? 0.69 : 0.48 + (index % 6) * 0.015,
      sampleSize: 2800 - index * 100,
      manaCost: (index % 9) + 1,
    }));
    fixtures[15] = {
      ...fixtures[15],
      usageRate: undefined,
      usage: 1,
      winRate: null,
    };
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/v2/meta/units") {
        requests.push(url);
        if (fail)
          return route.fulfill({ status: 500, json: { error: "unavailable" } });
        if (empty) return route.fulfill({ json: { items: [] } });
        const min = url.searchParams.get("minTrophies");
        if (slowTop && min === "6000")
          await new Promise((resolve) => setTimeout(resolve, 300));
        const marker = min === "6000" ? "Top " : min === "4000" ? "Mid " : "";
        const data = fixtures.map((clone) => ({
          ...clone,
          displayName: marker + clone.displayName,
        }));
        if (special)
          data.push({
            unitId: "missing",
            displayName: "Mystery <img src=x onerror=alert(1)>",
            rarity: 'bad" onclick="alert(1)',
            usage: 0.5,
            winRate: null,
            sampleSize: "invalid",
          });
        return route.fulfill({ json: { units: [...data, data[0]] } });
      }
      if (url.pathname.startsWith("/_vercel/"))
        return route.fulfill({
          body: "",
          contentType: "application/javascript",
        });
      if (url.hostname !== "127.0.0.1") return route.abort();
      return route.continue();
    });
    await page.goto(`${origin}/clones.html`);
    await page.waitForFunction(
      () => document.querySelectorAll(".clone-card").length === 16,
    );
    assert.equal(await page.locator("#clone-total").textContent(), "16");
    assert.equal(
      await page.locator("#clone-most-used").textContent(),
      "Bouncy Bomb",
    );
    assert.equal(
      await page
        .locator(".clone-card .metric-labels strong")
        .first()
        .textContent(),
      "40.0%",
    );
    assert.equal(
      await page
        .locator(".clone-card")
        .first()
        .locator(".metric-labels strong")
        .nth(1)
        .textContent(),
      "69.0%",
    );
    assert.equal(requests[0].searchParams.get("days"), "7");
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".clone-card"))
            .backdropFilter,
      ),
      "none",
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-clones-desktop.png"),
    });
    await page.locator(".clone-card").first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-clones-collection.png"),
    });
    const card = page.locator(".clone-card").first();
    await card.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector("#clone-modal:not(.hidden)");
    await page.waitForFunction(
      () => document.activeElement.id === "modal-close",
    );
    assert.equal(
      await page.locator("#modal-title").textContent(),
      "Bouncy Bomb",
    );
    assert.equal(
      await page.locator("main").evaluate((element) => element.inert),
      true,
    );
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page
        .locator(".modal-deck-link")
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator("#modal-close")
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-clones-modal.png"),
    });
    await page.keyboard.press("Escape");
    assert.equal(
      await card.evaluate((element) => element === document.activeElement),
      true,
    );
    assert.equal(
      await page.locator("main").evaluate((element) => element.inert),
      false,
    );
    await page.selectOption("#rarity-filter", "unreal");
    await page.waitForFunction(
      () => document.querySelectorAll(".clone-card").length === 3,
    );
    await page.selectOption("#mana-filter", "6");
    await page.waitForFunction(
      () => document.querySelectorAll(".clone-card").length === 1,
    );
    assert.equal(
      await page.locator(".clone-name").textContent(),
      "Core Bomber",
    );
    await page.locator("#reset-filters").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".clone-card").length === 16,
    );
    await page.locator("#search-input").fill("spiky");
    await page.waitForFunction(
      () => document.querySelectorAll(".clone-card").length === 1,
    );
    assert.equal(
      await page.locator(".metric-labels strong").first().textContent(),
      "1.0%",
    );
    assert.equal(
      await page.locator(".metric-labels strong").nth(1).textContent(),
      "—",
    );
    await page.locator("#search-input").fill("no such clone");
    await page.waitForSelector("#empty-state:not(.hidden)");
    await page.locator("#reset-filters").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".clone-card").length === 16,
    );
    await page.selectOption("#timeframe-filter", "30d");
    await page.waitForFunction(
      () =>
        document.querySelector("main").getAttribute("aria-busy") === "false",
    );
    assert.equal(requests.at(-1).searchParams.get("days"), "30");
    assert.equal(
      await page.locator("#clone-window").textContent(),
      "Last 30 Days",
    );
    const beforeCached = requests.length;
    await page.selectOption("#timeframe-filter", "7d");
    await page.waitForFunction(
      () =>
        document.querySelector("main").getAttribute("aria-busy") === "false",
    );
    assert.equal(requests.length, beforeCached);
    await page.selectOption("#mana-filter", "8");
    await page.waitForFunction(
      () => document.querySelectorAll(".clone-card").length === 2,
    );
    await page.locator("#reset-filters").click();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-clones-mobile.png"),
    });
    await page.setViewportSize({ width: 360, height: 520 });
    await page.locator(".clone-card").first().click();
    await page.waitForSelector("#clone-modal:not(.hidden)");
    assert.equal(
      await page
        .locator(".modal-card")
        .evaluate((element) => element.scrollHeight > element.clientHeight),
      true,
    );
    await page.locator(".modal-deck-link").scrollIntoViewIfNeeded();
    assert.equal(await page.locator(".modal-deck-link").isVisible(), true);
    await page.keyboard.press("Escape");
    await page.evaluate(() => localStorage.clear());
    slowTop = true;
    await page.selectOption("#trophy-filter", "top");
    await page.selectOption("#trophy-filter", "mid");
    await page.waitForFunction(
      () =>
        document.querySelector(".clone-name")?.textContent ===
        "Mid Bouncy Bomb",
    );
    assert.equal(requests.at(-1).searchParams.get("maxTrophies"), "5999");
    await page.waitForTimeout(400);
    assert.equal(
      await page.locator(".clone-name").first().textContent(),
      "Mid Bouncy Bomb",
    );
    special = true;
    await page.evaluate(() => localStorage.clear());
    await page.locator("#reset-filters").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".clone-card").length === 17,
    );
    await page.locator("#search-input").fill("mystery");
    await page.waitForFunction(
      () => document.querySelectorAll(".clone-card").length === 1,
    );
    await page.locator(".clone-card").scrollIntoViewIfNeeded();
    await page.waitForSelector(".clone-icon-placeholder");
    assert.equal(await page.locator(".clone-name img").count(), 0);
    assert.equal(
      await page.locator(".clone-card .rarity-badge").textContent(),
      "unknown",
    );
    assert.equal(
      await page.locator(".metric-labels strong").first().textContent(),
      "0.5%",
    );
    // Filtering during a failed fetch must keep the actionable error visible.
    fail = true;
    await page.evaluate(() => localStorage.clear());
    await page.selectOption("#timeframe-filter", "30d");
    await page.waitForSelector("#error-state:not(.hidden)");
    await page.locator("#search-input").fill("bomb");
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#error-state").isVisible(), true);
    assert.equal(await page.locator("#clone-grid").isVisible(), false);
    fail = false;
    await page.locator("#search-input").fill("");
    await page.locator("#retry-btn").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".clone-card").length === 17,
    );
    empty = true;
    await page.evaluate(() => localStorage.clear());
    await page.selectOption("#trophy-filter", "low");
    await page.waitForSelector("#empty-state:not(.hidden)");
    assert.equal(await page.locator("#clone-total").textContent(), "0");
    assert.equal(await page.locator("#clone-grid").isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(
      "Clones: desktop/mobile, filters, caching, percentages, focus trap, races, fallbacks, and errors passed.",
    );
  },
);
