// Production startup probe. Opens each public entry route as a new anonymous
// visitor and reports how long the first readable card takes. It never votes.
//
// With PP_PROBE_CUSTOM_TOKEN set (signed_in_probe job in the deploy workflow),
// each visit first signs in as the test reader from startup-probe-token.mjs,
// then measures the route from an empty browser cache. The token and the
// reader's id token are never printed.
import { chromium } from "playwright-core";

const base = process.env.PP_PROBE_BASE || "https://poetryplease.org";
const signInToken = process.env.PP_PROBE_CUSTOM_TOKEN || "";
const mode = signInToken ? "signed-in" : "anonymous";

// Signs the page's own Firebase app in, so the session is stored the way a
// real reader's is, then empties the HTTP cache so the measured visit is cold.
async function signIn(context, page) {
  await page.goto(base + "/app?desktop=1", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.firebase?.apps?.length > 0, null, { timeout: 45000 });
  const signedIn = await page.evaluate(async (token) => {
    const credential = await window.firebase.auth().signInWithCustomToken(token);
    return !!credential.user?.email;
  }, signInToken);
  if (!signedIn) throw new Error("test reader has no email after sign-in");
  await page.goto("about:blank");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.clearBrowserCache");
  await cdp.detach();
}
const routes = [
  // The card itself, not #media-wrap: on Desktop that wrapper also holds the
  // vote buttons, whose text alone used to pass as a readable card.
  ["Desktop", "/app?desktop=1&debugLoad=1", { width: 1280, height: 900 }, "#media-wrap .media-box"],
  ["Classic mobile", "/mobile.html?debugLoad=1", { width: 390, height: 844 }, "#media-wrap .media-box"],
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
    let signInError = "";
    if (signInToken) {
      try { await signIn(context, page); } catch (error) { signInError = "sign-in: " + error.message.split("\n")[0]; }
    }
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
    const errors = signInError ? [signInError] : [];
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
    // Declared before the listeners fire for the measured visit; requests from
    // the sign-in step have finished by now.
    sizes.length = 0;
    const started = Date.now();
    let firstCardMs = null;
    // "card" for a readable card, "empty" when the app says the feed is empty.
    let settled = "";
    let text = "";
    try {
      await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 90000 });
      settled = await page.waitForFunction((selector) => {
        const loader = document.getElementById("pp-loader");
        if (loader && getComputedStyle(loader).display !== "none"
          && getComputedStyle(loader).visibility !== "hidden" && !loader.classList.contains("is-hidden")) return false;
        const root = document.querySelector(selector);
        if (!root) return false;
        const visible = (element) => element.getBoundingClientRect().height > 0;
        const media = [...root.querySelectorAll("img")].some((img) => img.naturalWidth > 0 && visible(img))
          || [...root.querySelectorAll("video, iframe")].some(visible);
        if (media || (root.innerText || "").trim().length > 20) return "card";
        // Swipe reports an empty feed in its footer, outside the feed itself.
        const status = (document.getElementById("feed-status")?.textContent || "").trim();
        return /^No unreviewed items/.test(status) ? "empty" : false;
      }, rootSelector, { timeout: throttle ? 90000 : 45000 }).then((handle) => handle.jsonValue());
      firstCardMs = Date.now() - started;
      await page.waitForTimeout(1500);
    } catch (error) {
      errors.push("probe: " + error.message.split("\n")[0]);
    }
    // Captured even after a timeout, so a failed visit still shows its screen.
    text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 140)).catch(() => "");
    const marks = await page.evaluate(() => (window.PP_LOAD_TIMING?.rows || [])
      .map((row) => `${row.ms}ms ${row.label}`)).catch(() => []);
    if (firstCardMs === null || errors.length) failed = true;
    const beforeCard = sizes.filter((entry) => firstCardMs === null || entry.at <= firstCardMs);
    const totalKB = (list) => list.reduce((sum, entry) => sum + entry.kb, 0);
    const largest = sizes.slice().sort((a, b) => b.kb - a.kb).slice(0, 6).map((entry) => `${entry.kb}KB@${entry.at}ms ${entry.url}`);
    console.log(JSON.stringify({ mode, pass, name, settled, firstCardMs, kbBeforeCard: totalKB(beforeCard), kbTotal: totalKB(sizes), largest, api, marks, errors, text }));
    await context.close();
  }
}
await browser.close();
if (failed) process.exitCode = 1;
