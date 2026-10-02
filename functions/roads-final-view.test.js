import test from "node:test";
import assert from "node:assert/strict";
import { loadRoads, roadsCandidatePoems } from "../public/manuscript-reconciliation-live.js";

const roadsFixture = () => ({
  readOnly: true,
  writeEnabled: false,
  reconciliation: {
    id: 3,
    bookTitle: "Roads",
    candidateSource: { id: 12, isPreferred: true },
  },
  rows: [
    ...Array.from({ length: 65 }, (_, index) => ({
      candidate: {
        sourcePoemId: index + 1,
        sourceVersionId: 12,
        position: index + 1,
        title: index === 0 ? "Amazing" : `Poem ${index + 1}`,
        text: index === 0 ? "a\n\nb\n\nc\n\nd" : `text\n\n${"x\n\n".repeat(index < 8 ? 4 : 3)}end`,
      },
    })),
    ...Array.from({ length: 4 }, () => ({ candidate: null })),
  ],
});

test("Roads view accepts only the 65 preferred EPUB poems and preserves stanza structure", async () => {
  const fixture = roadsFixture();
  // Four old-only comparison records are not poems in the final source.
  assert.equal(roadsCandidatePoems(fixture).length, 65);
  fixture.rows.push(fixture.rows[0]);
  assert.equal(roadsCandidatePoems(fixture).length, 65);
  const calls = [];
  const loaded = await loadRoads("test-token", async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(fixture), { status: 200 });
  });
  assert.equal(loaded.poems.length, 65);
  assert.equal(calls[0].url, "/api/admin/manuscriptReconciliations/3");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-token");
  assert.equal(calls[0].options.method, undefined);
});

test("Roads view fails closed on wrong source, writable scope, or lost stanza breaks", () => {
  const fixture = roadsFixture();
  assert.throws(() => roadsCandidatePoems({ ...fixture, readOnly: false }), /not available/);
  assert.throws(() => roadsCandidatePoems({ ...fixture, reconciliation: { ...fixture.reconciliation, candidateSource: { id: 2, isPreferred: true } } }), /not available/);
  fixture.rows[0].candidate.text = "a\nb\nc\nd";
  assert.throws(() => roadsCandidatePoems(fixture), /stanza check/);
});
