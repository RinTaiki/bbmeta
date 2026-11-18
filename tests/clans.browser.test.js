import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

test(
  "Clans layout, badge mapping, search races, roster and shared navigation",
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
      slow = false,
      failMembers = false;
    const clans = Array.from({ length: 8 }, (_, i) => ({
      rank: i + 1,
      tag: "#C" + i,
      name: i === 0 ? "<Top Tribe>" : "Tribe " + i,
      score: 129000 - i * 100,
      memberCount: 50 - i,
      badge:
        i === 0
          ? { id: 10, file: "10.png" }
          : i === 1
            ? { name: "clan_icon_005" }
            : i === 2
              ? { file: "021.png" }
              : { id: 31 },
    }));
    const missing = [];
    page.on("response", (r) => {
      if (r.url().startsWith(origin + "/assets/") && r.status() >= 400)
        missing.push(r.url());
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/v1/rankings/clans")
        return route.fulfill(
          fail
            ? { status: 503, json: { error: "unavailable" } }
            : { json: { items: clans } },
        );
      if (url.pathname === "/api/v1/clans/search") {
        const query = url.searchParams.get("name");
        if (query === "slow")
          await new Promise((resolve) => setTimeout(resolve, 400));
        return route.fulfill({
          json: {
            items:
              query === "none"
                ? []
                : [{ ...clans[1], rank: undefined, name: query }],
          },
        });
      }
      if (url.pathname.startsWith("/api/v1/clans/")) {
        const tag = decodeURIComponent(url.pathname.split("/")[4]);
        if (slow && tag === "#C0")
          await new Promise((resolve) => setTimeout(resolve, 400));
        if (url.pathname.endsWith("/members"))
          return route.fulfill(
            failMembers
              ? { status: 503, json: { error: "unavailable" } }
              : {
                  json: {
                    items: [
                      {
                        tag: "#P1",
                        name: "Captain",
                        trophies: 6800,
                        role: "leader",
                      },
                      { tag: "#P2", name: "Second", trophies: 6900, role: "member" },
                    ],
                  },
                },
          );
        return route.fulfill({
          json: clans.find((c) => c.tag === tag) || clans[0],
        });
      }
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
    await page.goto(origin + "/clans.html");
    await page.locator("#clans-tbody tr").first().waitFor();
    assert.equal(await page.locator("#clans-tbody tr").count(), 8);
    assert.equal(await page.locator("#clan-total").textContent(), "8");
    assert.equal(
      await page.locator("#clans-tbody img").first().getAttribute("src"),
      "assets/badges/010.png",
    );
    assert.equal(
      await page.locator("#clans-tbody img").nth(1).getAttribute("src"),
      "assets/badges/005.png",
    );
    assert.equal(
      await page.locator("#clans-tbody img").nth(2).getAttribute("src"),
      "assets/badges/021.png",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-clans-desktop.png"),
    });
    await page.locator("#clans-sort").selectOption("name");
    await page
      .getByRole("button", { name: "Open <Top Tribe>", exact: true })
      .click();
    await page.locator("#clan-modal-content").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#clan-modal-badge").getAttribute("src"),
      "assets/badges/010.png",
    );
    assert.match(
      await page.locator("#clan-roster-note").textContent(),
      /2 members in the feed/,
    );
    assert.equal(
      await page.locator(".roster-player a").first().textContent(),
      "Second#P2",
    );
    assert.equal(
      await page.locator(".roster-podium-1 .roster-rank-value").textContent(),
      "1",
    );
    assert.equal(
      await page.locator(".roster-role").first().textContent(),
      "Member",
    );
    assert.equal(await page.locator("main").evaluate((el) => el.inert), true);
    await page.locator("#clan-modal-close").focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page
        .locator(".roster-player a")
        .last()
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-clans-modal.png"),
    });
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .getByRole("button", { name: "Open <Top Tribe>", exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    failMembers = true;
    await page
      .getByRole("button", { name: "Open Tribe 1", exact: true })
      .click();
    await page.locator("#clan-modal-error").waitFor({ state: "visible" });
    failMembers = false;
    await page.locator("#clan-modal-retry").click();
    await page.locator("#clan-modal-content").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.locator("#clan-search-input").fill("slow");
    await page.locator(".clans-search-btn").click();
    await page.locator("#clan-search-input").fill("latest");
    await page.locator(".clans-search-btn").click();
    await page.waitForFunction(
      () =>
        document.querySelector(".clans-clan-name")?.textContent === "latest",
    );
    assert.equal(await page.locator(".clans-rank-badge").textContent(), "—");
    await page.locator("#clan-search-input").fill("none");
    await page.locator(".clans-search-btn").click();
    await page.locator("#clans-empty").waitFor({ state: "visible" });
    await page.locator("#back-to-leaderboard").click();
    await page.locator("#clans-tbody tr").first().waitFor();
    const rankings = page
      .locator(".nav-group")
      .filter({ has: page.locator('a[href="clans.html"]') });
    await rankings.locator("summary").click();
    assert.equal(
      await rankings.locator('a[aria-current="page"]').textContent(),
      "ClansFind your tribe and rivals",
    );
    await page.keyboard.press("Escape");
    assert.equal(await rankings.getAttribute("open"), null);
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(await page.locator(".nav-links").isVisible(), false);
    await page.locator(".nav-toggle").click();
    await rankings.locator("summary").click();
    assert.equal(
      await rankings.locator('a[href="clans.html"]').isVisible(),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-navigation-mobile.png"),
    });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator(".nav-toggle").getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(tmpdir(), "bbmeta-clans-mobile.png"),
    });
    fail = true;
    await page.reload();
    await page.locator("#clans-error").waitFor({ state: "visible" });
    fail = false;
    await page.locator("#clans-retry").click();
    await page.locator("#clans-tbody tr").first().waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
  },
);
