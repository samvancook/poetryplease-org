// Production intro probe. Opens the public /intros page, taps each machine,
// waits for its slip, taps "Start reading", and checks that real Swipe cards
// are underneath. Runs on a phone and on desktop. Read-only.
// Run by the Startup probe workflow (signed out) and by the deploy workflow's
// signed_in_probe job (PP_PROBE_CUSTOM_TOKEN set: signs in as the test reader).
// PP_INTRO_DIRECT=1 opens /posts-swipe?intro=… directly instead of tapping /intros.
// PP_INTRO_SHOTS=<dir> saves a screenshot of each slip and of the feed after it.
// Usage: node intro-probe.mjs [base]
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright-core";

const base = process.argv[2] || process.env.PP_PROBE_BASE || "https://poetryplease.org";
const signInToken = process.env.PP_PROBE_CUSTOM_TOKEN || "";
const shots = process.env.PP_INTRO_SHOTS || "";
if (shots) mkdirSync(shots, { recursive: true });
const choices = { "Surprise me": "random", "Gumball dispenser": "dispenser", "Claw machine": "claw", Typewriter: "typewriter", Mimeograph: "press" };
const deviceProfiles = [
  ["phone", devices["iPhone 13"]],
  ["desktop", { viewport: { width: 1280, height: 900 } }],
];

async function signIn(page) {
  await page.goto(base + "/app?desktop=1", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.firebase?.auth, null, { timeout: 30000 });
  const ok = await page.evaluate(async (token) => !!(await window.firebase.auth().signInWithCustomToken(token)).user?.email, signInToken);
  if (!ok) throw new Error("test reader has no email after sign-in");
}

const browser = await chromium.launch({ channel: process.env.PP_PROBE_CHANNEL || "chrome", executablePath: process.env.PP_PROBE_CHROME || undefined });
let problems = 0;
console.log(`intro probe: ${signInToken ? "signed in" : "signed out"}, ${process.env.PP_INTRO_DIRECT ? "direct links" : "via /intros"}`);
for (const [deviceName, profile] of deviceProfiles) {
  for (const [choice, intro] of Object.entries(choices)) {
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message.split("\n")[0]));
    const label = `${choice} [${deviceName}]`;
    try {
      if (signInToken) await signIn(page);
      const started = Date.now();
      if (process.env.PP_INTRO_DIRECT) {
        await page.goto(`${base}/posts-swipe?intro=${intro}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      } else {
        await page.goto(base + "/intros", { waitUntil: "domcontentloaded", timeout: 60000 });
        if (shots && intro === "random") await page.screenshot({ path: `${shots}/${deviceName}-0-intros-page.png` });
        await page.getByRole("link", { name: choice }).click();
      }
      await page.waitForSelector(".pp-intro", { timeout: 20000 });
      const shownAt = Date.now() - started;
      const art = await page.evaluate(() => document.querySelector(".pp-intro")?.dataset.variant || "");
      await page.waitForSelector(".pp-intro button[data-ready]", { timeout: 30000 });
      const slipAt = Date.now() - started;
      if (shots) { await page.waitForTimeout(800); await page.screenshot({ path: `${shots}/${deviceName}-${intro}-1-slip.png` }); }
      await page.click(".pp-intro button");
      await page.waitForSelector(".pp-intro", { state: "detached", timeout: 5000 });
      await page.waitForSelector("#feed [data-item-id]", { timeout: 30000 });
      if (shots) { await page.waitForTimeout(1500); await page.screenshot({ path: `${shots}/${deviceName}-${intro}-2-feed.png` }); }
      const state = await page.evaluate(() => ({
        url: location.pathname + location.search,
        cards: document.querySelectorAll("#feed [data-item-id]").length,
        first: document.querySelector("#feed [data-item-id]")?.dataset.itemId || "",
      }));
      console.log(`ok   ${label}: ${art || "?"} intro at ${shownAt}ms, slip at ${slipAt}ms, then Swipe ${state.url} with ${state.cards} card(s), first ${state.first}${errors.length ? `; page errors: ${errors.join(" / ")}` : ""}`);
    } catch (error) {
      problems += 1;
      const introShown = await page.$(".pp-intro").catch(() => null);
      if (shots) await page.screenshot({ path: `${shots}/${deviceName}-${intro}-FAIL.png` }).catch(() => {});
      console.log(`FAIL ${label}: ${error.message.split("\n")[0]} (url ${page.url()}, intro ${introShown ? "on screen" : "absent"})${errors.length ? `; page errors: ${errors.join(" / ")}` : ""}`);
    }
    await context.close();
  }
}
await browser.close();
if (problems) process.exitCode = 1;
