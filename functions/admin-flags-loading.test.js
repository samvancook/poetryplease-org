import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../public/admin.html", import.meta.url), "utf8");
const expanded = html.slice(html.indexOf("    function loadExpandedSections()"), html.indexOf("    function setStatus("));
test("team plus contest-admin loads flags; contest-only and collapsed panels do not", () => {
  for (const [roles, collapsed, open, expected] of [
    [["user", "team", "contest_builder", "contest_admin"], false, true, ["flags"]],
    [["team"], false, true, ["flags"]],
    [["admin"], false, true, ["flags"]],
    [["contest_admin"], false, true, []],
    [["team"], true, true, []],
    [["team"], false, false, []],
  ]) {
    const loaded = [];
    const context = vm.createContext({ state: { me: { roles }, usersCollapsed: true, contentClaimsCollapsed: true,
      duplicateReviewCollapsed: true, userSubmissionsCollapsed: true, contentLibraryCollapsed: true,
      idHygieneCollapsed: true, flaggedContentCollapsed: collapsed },
    document: { getElementById: () => ({ open }) }, loadSectionOnce: (key) => loaded.push(key), loadFlags() {} });
    vm.runInContext(expanded + "\nloadExpandedSections();", context);
    assert.deepEqual(loaded, expected, JSON.stringify({ roles, collapsed, open }));
  }
});
test("failed flag load is retryable and marks both panels as failed", async () => {
  const elements = new Map();
  const getElementById = (id) => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); };
  const loaded = new Set(["flags"]);
  const context = vm.createContext({ document: { getElementById }, api: async () => { throw new Error("offline"); },
    loadedAdminSections: loaded, console: { error() {} } });
  const fn = html.slice(html.indexOf("    async function loadFlags()"), html.indexOf("    async function reviewClaim("));
  await vm.runInContext(fn + "\nloadFlags();", context);
  assert.equal(loaded.has("flags"), false);
  assert.equal(getElementById("flag-review-status").className, "status error");
  assert.match(getElementById("repair-request-status").textContent, /Refresh flags and repairs/);
});
