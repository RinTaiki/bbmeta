import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

test(
  "Shared navigation remains compact and accessible on every page",
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
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/api/"))
        return route.fulfill({
          status: 503,
          json: { error: "Fixture unavailable" },
        });
      if (url.pathname.startsWith("/_vercel/"))
        return route.fulfill({
          body: "",
          contentType: "application/javascript",
        });
      if (url.origin !== origin) return route.abort();
      return route.continue();
    });
    const landscapes = new Set();
    for (const filename of [
      "index.html",
      "leaderboard.html",
      "clones.html",
      "meta.html",
      "clans.html",
      "champions.html",
      "season-archive.html",
      "deck-builder.html",
      "about.html",
      "contact.html",
      "privacy.html",
      "profile.html",
      "season.html",
    ]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(origin + "/" + filename + (filename === "profile.html" ? "?tag=TEST" : ""));
      assert.equal(await page.locator(".theme-toggle").count(), 0);
      const landscape = await page.locator("body").evaluate(async (body) => {
        const style = getComputedStyle(body, "::before");
        const url = style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
        const image = new Image();
        image.src = url;
        await image.decode();
        return { url, width: image.naturalWidth, filter: style.filter, opacity: style.opacity };
      });
      assert.ok(landscape.width > 0, filename);
      assert.ok(!landscapes.has(landscape.url), `Duplicate background: ${filename}`);
      landscapes.add(landscape.url);
      assert.equal(landscape.filter, "none");
      assert.equal(landscape.opacity, "1");
      await page.screenshot({ animations: "disabled", path: path.join(tmpdir(), `bbmeta-scene-${filename}.png`) });

      assert.equal(await page.locator(".nav-links>a").count(), 1, filename);
      assert.equal(await page.locator(".nav-group").count(), 4, filename);
      assert.equal(
        await page
          .locator(".site-header")
          .evaluate((el) => el.scrollWidth <= innerWidth),
        true,
        filename,
      );
      await page
        .locator(".nav-group")
        .filter({ hasText: "Rankings" })
        .locator("summary")
        .click();
      assert.equal(
        await page.locator('nav a[href="clans.html"]').isVisible(),
        true,
        filename,
      );
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 360, height: 800 });
      assert.equal(
        await page.locator(".nav-links").isVisible(),
        false,
        filename,
      );
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Mobile overflow: ${filename}`);
      await page.screenshot({ animations: "disabled", path: path.join(tmpdir(), `bbmeta-scene-mobile-${filename}.png`) });
      await page.locator(".nav-toggle").click();
      assert.equal(
        await page.locator(".nav-links").isVisible(),
        true,
        filename,
      );
      assert.equal(
        await page
          .locator(".site-header")
          .evaluate((el) => el.scrollWidth <= innerWidth),
        true,
        filename,
      );
      await page
        .locator(".nav-group")
        .filter({ hasText: "Game" })
        .locator("summary")
        .click();
      assert.equal(
        await page.locator('nav a[href="clones.html"]').isVisible(),
        true,
        filename,
      );
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator(".nav-toggle").getAttribute("aria-expanded"),
        "false",
        filename,
      );
    }
  },
);
