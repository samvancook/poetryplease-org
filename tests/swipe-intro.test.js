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
});
