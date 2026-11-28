"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const rules = () => import(pathToFileURL(path.join(__dirname, "../public/swipe-intro-rules.js")).href);

test("intro groups split 10% dispenser, 10% claw, 80% none", async () => {
  const { variantFor } = await rules();
  assert.equal(variantFor(0), "dispenser");
  assert.equal(variantFor(0.0999), "dispenser");
  assert.equal(variantFor(0.1), "claw");
  assert.equal(variantFor(0.1999), "claw");
  assert.equal(variantFor(0.2), "none");
  assert.equal(variantFor(0.999), "none");
});

test("only plain Swipe visits qualify for the intro", async () => {
  const { isPlainVisit } = await rules();
  assert.equal(isPlainVisit(""), true);
  assert.equal(isPlainVisit("?utm_source=ig&fbclid=x"), true);
  assert.equal(isPlainVisit("?item=abc"), false);
  assert.equal(isPlainVisit("?catalog=Contest&locked=1"), false);
  assert.equal(isPlainVisit("?author=Someone"), false);
});

test("intro plays once a day for signed-out visitors and never late", async () => {
  const { shouldPlay, INTRO_GAP_MS, forcedVariant } = await rules();
  const base = { variant: "claw", signedIn: false, lastShown: 0, now: 10 * INTRO_GAP_MS, reducedMotion: false, cardAlreadyShown: false, forced: false };
  assert.equal(shouldPlay(base), true);
  assert.equal(shouldPlay({ ...base, variant: "none" }), false);
  assert.equal(shouldPlay({ ...base, signedIn: true }), false);
  assert.equal(shouldPlay({ ...base, reducedMotion: true }), false);
  assert.equal(shouldPlay({ ...base, cardAlreadyShown: true }), false);
  assert.equal(shouldPlay({ ...base, lastShown: base.now - 1000 }), false);
  assert.equal(shouldPlay({ ...base, lastShown: base.now - INTRO_GAP_MS - 1 }), true);
  assert.equal(shouldPlay({ ...base, signedIn: true, lastShown: base.now, forced: true }), true);
  assert.equal(forcedVariant("?intro=dispenser"), "dispenser");
  assert.equal(forcedVariant("?intro=bogus"), null);
  assert.equal(forcedVariant("?intro=typewriter"), "typewriter");
  assert.equal(shouldPlay({ ...base, variant: "press", signedIn: true, forced: true }), true);
  assert.equal(shouldPlay({ ...base, variant: "none", forced: true }), false);
  assert.equal(shouldPlay({ ...base, variant: "typewriter" }), false); // not a live test group
});

test("?intro=random plays one of the four drawn intros", async () => {
  const { pickArt, forcedVariant, INTRO_ART_VARIANTS } = await rules();
  assert.equal(forcedVariant("?intro=random"), "random");
  assert.deepEqual([0, 0.26, 0.51, 0.99, 1].map(r => pickArt("random", r)), ["dispenser", "claw", "typewriter", "press", "press"]);
  assert.equal(pickArt("claw", 0.9), "claw");
  assert.deepEqual(INTRO_ART_VARIANTS, ["dispenser", "claw", "typewriter", "press"]);
});

test("intro wording rotates through seven versions that fit the slip", async () => {
  const { INTRO_COPY, pickCopy } = await rules();
  assert.equal(INTRO_COPY.length, 7);
  for (const copy of INTRO_COPY) {
    assert.ok(copy.headline);
    assert.equal(copy.lines.length, 3);
    for (const line of copy.lines) assert.ok(line.length <= 24, line);
  }
  assert.equal(pickCopy("", 0).number, 1);
  assert.equal(pickCopy("", 0.99).number, 7);
  assert.equal(pickCopy("", 1).number, 7);
  assert.equal(pickCopy("?intro=claw&copy=5", 0).number, 5);
  assert.equal(pickCopy("?copy=9", 0.5).number, 4); // out of range falls back to random
});
