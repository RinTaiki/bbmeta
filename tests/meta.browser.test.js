import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

test(
  "Meta layout, filters, rendering, errors and request races",
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
    let fail = false,
      slow = false;
    const requests = [];
    const items = Array.from({ length: 16 }, (_, i) => ({
      winRate: 0.72 - i * 0.01,
      usageRate: 0.01 + i * 0.002,
      sampleSize: 2000 + i * 100,
      units: [
        { unitId: 2, displayName: "Big Smith" },
        { unitId: 25, displayName: "Bouncy Bomb" },
        { unitId: 19, displayName: "Plain Bomb" },
        { unitId: 5, displayName: "Bomb Golem" },
        { unitId: 7, displayName: "Firebirds" },
        { unitId: 42, displayName: "Core Bomber" },
        { unitId: 23, displayName: "Doggos" },
        { unitId: 34, displayName: "Big Bouncy Doom" },
      ],
    }));
    items[15] = {
      winRate: null,
      usageRate: null,
      sampleSize: null,
      units: [{ unitId: 999, displayName: "<Unknown>" }],
    };
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/v2/meta/decks") {
        requests.push(url);
        if (slow && url.searchParams.get("minTrophies") === "6000")
          await new Promise((r) => setTimeout(r, 500));
        if (fail)
          return route.fulfill({ status: 503, json: { error: "unavailable" } });
        return route.fulfill({ json: { items } });
      }
      if (url.pathname.startsWith("/_vercel/"))
        return route.fulfill({
          body: "",
          contentType: "application/javascript",
        });
      if (url.origin !== origin) return route.abort();
      return route.continue();
    });
    await page.goto(origin + "/meta.html");
    await page.locator(".deck-card").first().waitFor();
    assert.equal(await page.locator(".deck-card").count(), 12);
    assert.equal(await page.locator("#best-win").textContent(), "72.0%");
    assert.equal(
      await page.locator(".deck-card .win").first().textContent(),
      "72.0%",
    );
    assert.equal(
      await page.locator(".deck-card img[src*=fankit_bigbouncydoom]").count(),
      12,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-meta-desktop.png"),
    });
    await page.locator("#load-more").click();
    assert.equal(await page.locator(".deck-card").count(), 16);
    await page.locator("#sort-select").selectOption("sampleSize");
    assert.equal(
      await page.locator(".deck-card .deck-stat-value").nth(2).textContent(),
      "3,400",
    );
    await page.locator("#deck-search").fill("<Unknown>");
    assert.equal(await page.locator(".deck-card").count(), 1);
    assert.equal(await page.locator(".deck-card .win").textContent(), "—");
    assert.equal(
      await page.locator(".deck-card .clone-icon").textContent(),
      "<",
    );
    await page.locator("#deck-search").fill("no such clone");
    assert.equal(await page.locator("#empty-state").isVisible(), true);
    assert.equal(await page.locator(".deck-card").count(), 0);
    await page.locator("#deck-search").fill("");
    await page.locator("#timeframe-select").selectOption("30");
    await page.waitForFunction(() =>
      document.getElementById("results-label").textContent.includes("30 days"),
    );
    assert.equal(requests.at(-1).searchParams.get("days"), "30");
    slow = true;
    await page.getByRole("button", { name: "6,000+", exact: true }).click();
    await page
      .getByRole("button", { name: "4,000–5,999", exact: true })
      .click();
    await page.locator(".deck-card").first().waitFor();
    assert.equal(requests.at(-1).searchParams.get("minTrophies"), "4000");
    assert.equal(
      await page
        .getByRole("button", { name: "4,000–5,999", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    fail = true;
    await page.getByRole("button", { name: "< 4,000", exact: true }).click();
    await page.locator("#error-state").waitFor({ state: "visible" });
    assert.equal(await page.locator(".deck-card").count(), 0);
    fail = false;
    await page.locator("#retry-btn").click();
    await page.locator(".deck-card").first().waitFor();
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-meta-mobile.png"),
    });
    await page.locator("#deck-library").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-meta-decks-mobile.png"),
    });
    assert.deepEqual(errors, []);
  },
);
