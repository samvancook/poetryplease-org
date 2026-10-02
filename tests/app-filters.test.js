import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("the event filter is refilled when a feed payload arrives", () => {
  // The Filter by Event select was permanently empty in production even though the server
  // returned sourceEvents. Types and catalogs each have a dedicated endpoint to fall back
  // to (/imageTypes, /releaseCatalogs) when the cached payload is not ready yet:
  assert.match(app, /cachedTypes \? populateTypesSelect\(cachedTypes\) : fetchAndPopulateTypes\(\)/);
  assert.match(app, /cachedCatalogs \? populateCatalogsSelect\(cachedCatalogs\) : fetchAndPopulateCatalogs\(\)/);

  // Events have no such endpoint, and the boot path defaults them to an empty array, so a
  // boot that runs before lastData lands leaves the select empty forever.
  assert.match(app, /const cachedEvents = Array\.isArray\(lastData\?\.sourceEvents\) \? lastData\.sourceEvents : \[\]/);
  assert.equal(/fetchAndPopulateEvents/.test(app), false);

  // So the payload path has to refill it. This is the assertion that would have failed.
  const init = app.slice(app.indexOf("function initQueueFromData"), app.indexOf("function initQueueFromData") + 1400);
  assert.notEqual(app.indexOf("function initQueueFromData"), -1);
  assert.match(init, /populateEventsSelect\(data\.sourceEvents\)/);
  // Embed views take their filters from the URL and must not be touched.
  assert.match(init, /!IS_EMBED_UI/);
});

test("refilling the event select preserves the reviewer's current choice", () => {
  // populateEventsSelect clears and rebuilds the options, so it must restore the selection
  // or refilling mid-session would silently reset an active filter back to All Events.
  const fn = app.slice(app.indexOf("async function populateEventsSelect"));
  const body = fn.slice(0, fn.indexOf("\n}") + 2);
  assert.match(body, /option:not\(:first-child\)/);
  assert.match(body, /syncFilterControls\(\)/);
  assert.match(app, /if \(eventSel\) eventSel\.value = selectedEvent/);
});
