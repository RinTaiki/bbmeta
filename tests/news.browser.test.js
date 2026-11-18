import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

test(
  "News dialog design, sorting, unread storage, focus and mobile",
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
      if (url.pathname === "/api/creators")
        return route.fulfill({ json: { creators: [] } });
      if (url.pathname.startsWith("/_vercel/"))
        return route.fulfill({
          body: "",
          contentType: "application/javascript",
        });
      if (url.origin !== origin) return route.abort();
      return route.continue();
    });
    await page.goto(origin + "/index.html");
    const trigger = page.locator("#news-trigger-btn"),
      overlay = page.locator("#news-popup-overlay");
    assert.equal(await overlay.isVisible(), false);
    assert.equal(await page.locator("#news-unread-badge").textContent(), "5");
    await trigger.click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    assert.equal(await trigger.getAttribute("aria-expanded"), "true");
    assert.equal(
      await page
        .locator("#news-close-btn")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    assert.equal(await page.locator("main").evaluate((el) => el.inert), true);
    assert.equal(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
    );
    assert.equal(await page.locator("#news-unread-badge").isVisible(), false);
    assert.equal(
      await page.locator(".news-item h3").first().textContent(),
      "Redesigned UI and bug fixes",
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-news-desktop.png"),
    });
    await page
      .getByRole("button", { name: "Oldest first", exact: true })
      .click();
    assert.equal(
      await page.locator(".news-item h3").first().textContent(),
      "Leaderboard Expanded",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Oldest first", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#news-close-btn").focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page
        .locator(".news-discord-link")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator("#news-close-btn")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(await overlay.isVisible(), false);
    assert.equal(
      await trigger.evaluate((el) => el === document.activeElement),
      true,
    );
    assert.equal(await page.locator("main").evaluate((el) => el.inert), false);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    await page.reload();
    assert.equal(await page.locator("#news-unread-badge").isVisible(), false);
    await page.evaluate(() =>
      localStorage.setItem("bbmeta_news_read", JSON.stringify("bad state")),
    );
    await page.reload();
    assert.equal(await page.locator("#news-unread-badge").textContent(), "5");
    await page.setViewportSize({ width: 360, height: 800 });
    await trigger.click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.equal(
      await page
        .locator(".news-popup")
        .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-news-mobile.png"),
    });
    await page.setViewportSize({ width: 640, height: 400 });
    assert.equal(
      await page
        .locator(".news-popup")
        .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
      true,
    );
    assert.equal(
      await page
        .locator(".news-popup-body")
        .evaluate(
          (el) => el.clientHeight > 40 && el.scrollHeight > el.clientHeight,
        ),
      true,
    );
    await page.locator("#news-close-btn").click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await trigger.click();
    await overlay.click({ position: { x: 5, y: 5 } });
    assert.equal(await overlay.isVisible(), false);
    await page.evaluate(() => {
      localStorage.clear();
      Storage.prototype.setItem = () => {
        throw new Error("Storage blocked");
      };
    });
    await trigger.click();
    assert.equal(await page.getByRole("dialog").isVisible(), true);
    assert.deepEqual(errors, []);
  },
);
