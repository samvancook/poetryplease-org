// Read-only production startup probe. Opens each public entry route as a new
// anonymous visitor and reports how long the first readable card takes.
// It never votes, signs in or writes data.
import { chromium } from "playwright";

const base = process.env.PP_PROBE_BASE || "https://poetryplease.org";
const routes = [
  ["Desktop", "/app?desktop=1&debugLoad=1", { width: 1280, height: 900 }, "#media-wrap"],
  ["Classic mobile", "/mobile.html?debugLoad=1", { width: 390, height: 844 }, "#media-wrap"],
  ["Swipe", "/m", { width: 390, height: 844 }, "#feed"],
];
const passes = Number(process.env.PP_PROBE_PASSES || 2);

const browser = await chromium.launch();
let failed = false;
for (let pass = 1; pass <= passes; pass += 1) {
  for (const [name, route, viewport, rootSelector] of routes) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    const api = [];
    let bytes = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", async (response) => {
      const url = new URL(response.url());
      const request = response.request();
      const timing = request.timing();
      const size = Number(response.headers()["content-length"] || 0);
      bytes += size;
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
      await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 60000 });
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
      }, rootSelector, { timeout: 45000 });
      firstCardMs = Date.now() - started;
      await page.waitForTimeout(1500);
      text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 140);
    } catch (error) {
      errors.push("probe: " + error.message.split("\n")[0]);
    }
    const marks = await page.evaluate(() => (window.PP_LOAD_TIMING?.rows || [])
      .map((row) => `${row.ms}ms ${row.label}`)).catch(() => []);
    if (firstCardMs === null || errors.length) failed = true;
    console.log(JSON.stringify({ pass, name, firstCardMs, declaredKB: Math.round(bytes / 1024), api, marks, errors, text }));
    await context.close();
  }
}
await browser.close();
if (failed) process.exitCode = 1;
