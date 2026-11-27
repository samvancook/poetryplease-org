// Production intro probe. Opens the public /intros page on a phone, taps each
// machine, waits for its slip, taps "Start reading", and checks that real Swipe
// cards are underneath. Read-only. Run by the Startup probe workflow.
// Usage: node intro-probe.mjs [base]
import { chromium, devices } from "playwright-core";

const base = process.argv[2] || process.env.PP_PROBE_BASE || "https://poetryplease.org";
const choices = ["Surprise me", "Gumball dispenser", "Claw machine", "Typewriter", "Mimeograph"];
const browser = await chromium.launch({ channel: process.env.PP_PROBE_CHANNEL || "chrome", executablePath: process.env.PP_PROBE_CHROME || undefined });
let problems = 0;
for (const choice of choices) {
  const context = await browser.newContext(devices["iPhone 13"]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message.split("\n")[0]));
  const started = Date.now();
  try {
    await page.goto(base + "/intros", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("link", { name: choice }).click();
    await page.waitForSelector(".pp-intro", { timeout: 20000 });
    const shownAt = Date.now() - started;
    await page.waitForSelector(".pp-intro button[data-ready]", { timeout: 30000 });
    await page.click(".pp-intro button");
    await page.waitForSelector(".pp-intro", { state: "detached", timeout: 5000 });
    await page.waitForSelector("#feed [data-item-id]", { timeout: 30000 });
    const state = await page.evaluate(() => ({
      url: location.pathname + location.search,
      cards: document.querySelectorAll("#feed [data-item-id]").length,
      first: document.querySelector("#feed [data-item-id]")?.dataset.itemId || "",
    }));
    console.log(`ok   ${choice}: intro at ${shownAt}ms, then Swipe ${state.url} with ${state.cards} card(s), first ${state.first}${errors.length ? `; page errors: ${errors.join(" / ")}` : ""}`);
  } catch (error) {
    problems += 1;
    const intro = await page.$(".pp-intro").catch(() => null);
    console.log(`FAIL ${choice}: ${error.message.split("\n")[0]} (url ${page.url()}, intro ${intro ? "on screen" : "absent"})${errors.length ? `; page errors: ${errors.join(" / ")}` : ""}`);
  }
  await context.close();
}
await browser.close();
if (problems) process.exitCode = 1;
