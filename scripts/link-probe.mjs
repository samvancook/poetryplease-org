// Production deep-link probe. Opens each link as a new anonymous visitor, on a
// phone and on desktop, and reports where it lands, the first card, and what
// the lane serves next. It never votes: the next batch is requested with the
// app's own refill, not by skipping or voting. Run by the Startup probe
// workflow. Usage: node link-probe.mjs [base]
import { chromium, devices } from "playwright-core";

const base = process.argv[2] || process.env.PP_PROBE_BASE || "https://poetryplease.org";
const rudyBook = "Excuse Me As I Kiss The Sky";
const utm = "utm_source=mailchimp&utm_medium=sms&utm_campaign=2026-11_poem-text-rudy";
const links = [
  { name: "Rudy poem + book lane (SMS)", path: `/?item=EMAI-FP-NOW-I-ONLY&book=${encodeURIComponent(rudyBook)}&locked=1&${utm}`, item: "EMAI-FP-NOW-I-ONLY", book: rudyBook, laneEnd: true },
  { name: "Rudy poem only", path: "/m?item=EMAI-FP-NOW-I-ONLY", item: "EMAI-FP-NOW-I-ONLY" },
  { name: "Share link", path: "/app?item=EMAI-FP-NOW-I-ONLY", item: "EMAI-FP-NOW-I-ONLY" },
  { name: "Book link", path: `/app?book=${encodeURIComponent(rudyBook)}`, book: rudyBook },
  { name: "Book embed tap", path: `/app?item=EMAI-FP-NOW-I-ONLY&book=${encodeURIComponent(rudyBook)}&catalog=Fall%202023&locked=1`, item: "EMAI-FP-NOW-I-ONLY", book: rudyBook },
  { name: "Author lane", path: "/app?author=Rudy%20Francisco&locked=1", author: "Rudy Francisco" },
  { name: "Short Form 2026 lane", path: "/app?catalog=Contest&book=Short%20Form%202026&locked=1", book: "Short Form 2026" },
  { name: "Chapbook winners", path: "/?bookGroup=chapbook-winners&type=QI" },
  { name: "Contest winners reading", path: "/posts-swipe?catalog=Contest&event=Button%20Poetry%27s%20Fall%202026%20Short%20Form%20Contest&type=QI&locked=1&reading=1" },
];
const deviceProfiles = [
  ["phone", devices["iPhone 13"]],
  ["desktop", { viewport: { width: 1280, height: 900 } }],
];

// Reads the visible state of whichever viewer the link landed in.
async function readState(page) {
  return page.evaluate(() => {
    const text = (el) => (el?.innerText || "").replace(/\s+/g, " ").trim();
    const swipeCards = [...document.querySelectorAll("#feed [data-item-id]")].map((card) => card.dataset.itemId);
    const classic = typeof currentItem !== "undefined";
    const item = classic && currentItem ? currentItem : null;
    const bookButtonUrl = classic && item?.bookUrl && typeof ppCampaignBookUrl === "function" ? ppCampaignBookUrl(item.bookUrl) : "";
    const swipeBook = document.querySelector("#feed .post-book-link")?.href || "";
    return {
      url: location.pathname + location.search,
      viewer: swipeCards.length || document.querySelector("#feed") ? "Swipe" : location.pathname.startsWith("/m-classic") || location.pathname.startsWith("/mobile") ? "classic mobile" : "desktop",
      first: item ? [item.id, item.book, item.author].join(" | ") : swipeCards[0] || "",
      swipeCards: swipeCards.length,
      status: text(document.getElementById("feed-status")),
      welcomePrompt: !!document.getElementById("pp-welcome-choice"),
      loginScreen: !!document.querySelector("#login-screen:not([hidden])") && getComputedStyle(document.querySelector("#login-screen")).display !== "none",
      bookLink: bookButtonUrl || swipeBook,
      lockedLane: typeof lockedLane !== "undefined" ? lockedLane : null,
    };
  });
}

const browser = await chromium.launch({ channel: process.env.PP_PROBE_CHANNEL || "chrome", executablePath: process.env.PP_PROBE_CHROME || undefined });
let problems = 0;
for (const link of links) {
  for (const [deviceName, profile] of deviceProfiles) {
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message.split("\n")[0]));
    const label = `${link.name} [${deviceName}]`;
    try {
      await page.goto(base + link.path, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => (typeof currentItem !== "undefined" && currentItem)
        || document.querySelector("#feed [data-item-id]"), null, { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(3000);
      const state = await readState(page);
      console.log(`\n${label}\n  landed: ${state.viewer} ${state.url}\n  first: ${state.first || "(none)"}`
        + `\n  swipe cards: ${state.swipeCards}  status: ${state.status || "-"}  locked: ${state.lockedLane}`
        + `\n  welcome prompt: ${state.welcomePrompt}  login screen: ${state.loginScreen}`
        + (state.bookLink ? `\n  book link: ${state.bookLink}` : ""));
      if (link.item && !state.first.startsWith(link.item)) { problems++; console.log("  PROBLEM: linked item is not first"); }
      if (state.loginScreen) { problems++; console.log("  PROBLEM: login screen shown"); }
      if (link.path.includes("utm_") && state.bookLink && !state.bookLink.includes("utm_medium=sms")) { problems++; console.log("  PROBLEM: book link lost the utm tags"); }

      // What the lane serves next, using the classic viewer's own refill.
      if (state.viewer !== "Swipe" && (link.book || link.author)) {
        const next = await page.evaluate(async () => {
          await refillCurrentViewWithRetry();
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return queue.map((item) => ({ id: item.id, book: item.book, author: item.author }));
        });
        const books = {}; const authors = {};
        for (const row of next) { books[row.book] = (books[row.book] || 0) + 1; authors[row.author] = (authors[row.author] || 0) + 1; }
        console.log(`  next batch: ${next.length} cards; books ${JSON.stringify(books)}; authors ${JSON.stringify(authors)}`);
        const wrong = link.book ? next.filter((row) => row.book !== link.book) : next.filter((row) => row.author !== link.author);
        if (!next.length || wrong.length) { problems++; console.log(`  PROBLEM: ${next.length ? wrong.length + " cards outside the lane" : "no next cards"}`); }
      } else if (state.viewer === "Swipe") {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(4000);
        const after = await readState(page);
        console.log(`  after scrolling: ${after.swipeCards} cards, status: ${after.status || "-"}`);
      }

      // The end of a locked lane, brought up directly, and its release button.
      if (link.laneEnd && state.viewer !== "Swipe") {
        await page.evaluate(() => renderEmptyFilterState());
        const endText = await page.evaluate(() => (document.getElementById("gallery")?.innerText || "").replace(/\s+/g, " ").trim());
        await page.evaluate(() => document.getElementById("btn-show-more-poems")?.click());
        await page.waitForFunction(() => typeof currentItem !== "undefined" && currentItem, null, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(2000);
        const released = await readState(page);
        console.log(`  lane end: "${endText}"\n  after Show me more poems!: ${released.url} locked=${released.lockedLane} first: ${released.first}`);
        if (released.lockedLane !== false || !released.first) { problems++; console.log("  PROBLEM: release did not open the normal feed"); }
      }
      if (errors.length) console.log(`  page errors: ${errors.join(" / ")}`);
    } catch (error) {
      problems++;
      console.log(`\n${label}\n  PROBLEM: ${error.message.split("\n")[0]}`);
    } finally {
      await context.close();
    }
  }
}
await browser.close();
console.log(`\n${problems ? problems + " problem(s)" : "No problems found"}.`);
