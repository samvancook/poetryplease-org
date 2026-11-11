// Read-only production startup probe. Opens each public entry route as a new
// anonymous visitor and reports how long the first readable card takes.
// It never votes, signs in or writes data.
import { chromium } from "playwright-core";

const base = process.env.PP_PROBE_BASE || "https://poetryplease.org";
const routes = [
  ["Desktop", "/app?desktop=1&debugLoad=1", { width: 1280, height: 900 }, "#media-wrap"],
  ["Classic mobile", "/mobile.html?debugLoad=1", { width: 390, height: 844 }, "#media-wrap"],
  ["Swipe", "/m", { width: 390, height: 844 }, "#feed"],
];
// Two passes on the runner's fast network, then one shaped like a mid-range
// phone connection (about 1.6 Mbps down, 150 ms latency).
const passes = [
  { label: "fast-1" },
  { label: "fast-2" },
  { label: "slow-phone", throttle: { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 94 * 1024 } },
];

const browser = await chromium.launch({ channel: "chrome" });
let failed = false;
for (const { label: pass, throttle } of passes) {
  for (const [name, route, viewport, rootSelector] of routes) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    if (throttle) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", throttle);
    }
    const sizes = [];
    page.on("requestfinished", async (request) => {
      try {
        const size = (await request.sizes()).responseBodySize;
        const url = new URL(request.url());
        sizes.push({ kb: Math.round(size / 1024), at: Date.now() - started, url: (url.host === new URL(base).host ? "" : url.host) + url.pathname.slice(0, 70) });
      } catch { /* page closed */ }
    });
    const errors = [];
    const api = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", async (response) => {
      const url = new URL(response.url());
      const request = response.request();
      const timing = request.timing();
      if (url.pathname.startsWith("/api/")) {
        api.push({
          path: url.pathname,
          status: response.status(),
          startedMs: Math.round(timing.startTime - started),
          waitMs: Math.round(timing.responseStart),
          serverTiming: response.headers()["server-timing"] || "",
        });
      }
    });
    const started = Date.now();
    let firstCardMs = null;
    let text = "";
    try {
      await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForFunction((selector) => {
        const loader = document.getElementById("pp-loader");
        if (loader && getComputedStyle(loader).display !== "none"
          && getComputedStyle(loader).visibility !== "hidden" && !loader.classList.contains("is-hidden")) return false;
        const root = document.querySelector(selector);
        if (!root) return false;
        const visible = (element) => element.getBoundingClientRect().height > 0;
        const media = [...root.querySelectorAll("img")].some((img) => img.naturalWidth > 0 && visible(img))
          || [...root.querySelectorAll("video, iframe")].some(visible);
        return media || (root.innerText || "").trim().length > 20;
      }, rootSelector, { timeout: throttle ? 90000 : 45000 });
      firstCardMs = Date.now() - started;
      await page.waitForTimeout(1500);
      text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 140);
    } catch (error) {
      errors.push("probe: " + error.message.split("\n")[0]);
    }
    const marks = await page.evaluate(() => (window.PP_LOAD_TIMING?.rows || [])
      .map((row) => `${row.ms}ms ${row.label}`)).catch(() => []);
    if (firstCardMs === null || errors.length) failed = true;
    const beforeCard = sizes.filter((entry) => firstCardMs === null || entry.at <= firstCardMs);
    const totalKB = (list) => list.reduce((sum, entry) => sum + entry.kb, 0);
    const largest = sizes.slice().sort((a, b) => b.kb - a.kb).slice(0, 6).map((entry) => `${entry.kb}KB@${entry.at}ms ${entry.url}`);
    console.log(JSON.stringify({ pass, name, firstCardMs, kbBeforeCard: totalKB(beforeCard), kbTotal: totalKB(sizes), largest, api, marks, errors, text }));
    await context.close();
  }
}
await browser.close();
if (failed) process.exitCode = 1;
