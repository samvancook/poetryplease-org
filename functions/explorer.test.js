"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const explorer = require("../public/explorer/explorer.js");

test("authorization accepts only team and admin roles", () => {
  assert.equal(explorer.isTeamProfile({ roles: ["team"] }), true);
  assert.equal(explorer.isTeamProfile({ roles: ["admin"] }), true);
  assert.equal(explorer.isTeamProfile({ roles: ["author"] }), false);
  assert.equal(explorer.isTeamProfile({ role: "admin" }), false);
});

test("search and author/book filters stay scoped to matching works", () => {
  const rows = [
    { title: "The Future", author: "Neil Hilborn", book: "Our Numbered Days", catalog: "Spring 2015" },
    { title: "Complainers", author: "Rudy Francisco", book: "Helium", catalog: "Fall 2017" },
  ];
  assert.deepEqual(explorer.filterWorks(rows, { query: "future" }).map((row) => row.title), ["The Future"]);
  assert.deepEqual(explorer.filterWorks(rows, { author: "rudy francisco", book: "helium" }).map((row) => row.title), ["Complainers"]);
  assert.equal(explorer.filterWorks(rows, { author: "Neil Hilborn", book: "Helium" }).length, 0);
});

test("identity display distinguishes stable, linked, inferred, and unmatched relationships", () => {
  assert.equal(explorer.relationshipLabel({ workId: "work-1" }).key, "exact");
  assert.equal(explorer.relationshipLabel({ imageId: "asset-1" }).key, "linked");
  assert.equal(explorer.relationshipLabel({ title: "Possible title match" }).key, "inferred");
  assert.equal(explorer.relationshipLabel({}).key, "unmatched");
});

test("read-only guard rejects every mutating HTTP method", () => {
  assert.equal(explorer.assertReadOnlyRequest("GET"), "GET");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.throws(() => explorer.assertReadOnlyRequest(method), /read-only/i);
  }
});

test("view model derives selectors without mutating API rows", () => {
  const payload = { rows: [
    { title: "B", author: "Author B", book: "Book 2" },
    { title: "A", author: "Author A", book: "Book 1" },
    { title: "A2", author: "Author A", book: "Book 1" },
  ], bookSummaries: [{ book: "Book 1" }] };
  const model = explorer.viewModel(payload);
  assert.deepEqual(model.authors, ["Author A", "Author B"]);
  assert.deepEqual(model.books, ["Book 1", "Book 2"]);
  assert.equal(payload.rows.length, 3);
});
