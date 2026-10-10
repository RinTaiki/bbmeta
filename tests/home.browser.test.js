import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

test(
  "Home layout, player search, creators visibility and assets",
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
    let creators = [];
    const missing = [];
    page.on("response", (response) => {
      if (
        response.url().startsWith(origin + "/assets/") &&
        response.status() >= 400
      )
        missing.push(response.url());
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/creators")
        return route.fulfill({ json: { creators } });
      if (url.pathname.startsWith("/_vercel/"))
        return route.fulfill({
          body: "",
          contentType: "application/javascript",
        });
      if (url.pathname === "/profile.html")
        return route.fulfill({
          body: "<h1>Profile destination</h1>",
          contentType: "text/html",
        });
      if (url.origin !== origin) return route.abort();
      return route.continue();
    });
    await page.goto(origin + "/index.html");
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("#creators-section").isVisible(), false);
    assert.equal(await page.locator(".home-feature").count(), 4);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-home-desktop.png"),
    });
    await page.locator("#player-tag-input").fill("###");
    await page.locator(".search-button").click();
    assert.equal(
      await page
        .locator("#player-tag-input")
        .evaluate((input) => input.validity.valid),
      false,
    );
    assert.equal(page.url(), origin + "/index.html");
    await page.locator("#player-tag-input").fill("abc123");
    await Promise.all([
      page.waitForURL("**/profile.html?tag=%23ABC123"),
      page.locator(".search-button").click(),
    ]);
    creators = [
      {
        channelName: "NinjaX Play",
        videos: [
          { videoId: "dQw4w9WgXcQ", title: "A new brawl", thumbnailUrl: "" },
          { videoId: "dQw4w9WgXcQ", title: "Older video" },
        ],
      },
    ];
    await page.goto(origin + "/index.html");
    await page.locator(".creator-card").waitFor();
    assert.equal(await page.locator(".creator-card").count(), 1);
    assert.equal(
      await page.locator(".creator-name").textContent(),
      "NinjaX Play",
    );
    assert.equal(
      await page.evaluate(() => {
        const hero = document.querySelector(".hero"),
          creators = document.querySelector("#creators-section"),
          features = document.querySelector(".home-explore");
        return (
          !!(
            hero.compareDocumentPosition(creators) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ) &&
          !!(
            creators.compareDocumentPosition(features) &
            Node.DOCUMENT_POSITION_FOLLOWING
          )
        );
      }),
      true,
    );
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-home-mobile.png"),
    });
    await page.locator(".home-explore").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-home-features-mobile.png"),
    });
    await page.locator("#find-player-tag").scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    assert.deepEqual(missing, []);
    assert.deepEqual(errors, []);
  },
);
