import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const renderCounter = app.slice(app.indexOf("function renderCounter"));
const body = renderCounter.slice(0, renderCounter.indexOf("\n}") + 2);

test("reviewers get a position indicator that is separate from the staff counter", () => {
  // The existing #domain-counter is a staff counter appended into #counters-bar, which is
  // display:none since the counters moved into the admin modal. So nothing told a reviewer
  // how far through a queue they were. This is a distinct, author-facing element.
  assert.match(app, /id = 'review-progress'/);
  assert.match(app, /#counters-bar\{ display:none !important/);
  assert.match(body, /\$\('#review-progress'\)/);
  // It sits directly above the vote buttons.
  assert.match(app, /insertBefore\(progress, voteRow\)/);
  // Embed views get none of the review chrome.
  assert.match(app, /body\[data-ui="embed"\] #review-progress/);
});

test("the indicator is limited to a filtered lane", () => {
  // Measured against production: unfiltered it reads "Item 2418 of 27944", which tells a
  // reviewer nothing, and the server's overall counts do not reconcile with totalImages
  // (27944 against 2417 + 25698). Inside a book lane the same code read "Item 46 of 216"
  // with 45 + 171 = 216, which is the case this exists for.
  assert.match(body, /hasActiveFeedFilters\(\)/);
  // Position is counted from the lane's already-voted items plus the queue index.
  assert.match(body, /const position = votedInDomain \+ Math\.max\(idx, 0\) \+ 1/);
  // Guarded so it cannot render a position past the lane total or with no item selected.
  assert.match(body, /idx >= 0/);
  assert.match(body, /position <= displayTotal/);
  assert.match(body, /displayTotal > 0/);
  // The last item says so rather than claiming zero left.
  assert.match(body, /last one/);
});
