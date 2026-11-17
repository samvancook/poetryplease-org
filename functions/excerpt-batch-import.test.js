import test from "node:test";
import assert from "node:assert/strict";
import { excerptMatchKey, planExcerptBatch } from "./excerpt-batch-import.mjs";

test("match key ignores quotes, line breaks and punctuation", () => {
  assert.equal(
    excerptMatchKey("“Don’t be alone. When you are alone,\nyou won’t do anything.”"),
    excerptMatchKey("Don't be alone. When you are alone, you won't do anything")
  );
});

test("plan marks same text or same source record as exists, everything else new", () => {
  const records = [
    { sourceRecordId: "a", poem: "OCD", excerpt: "I want her back so bad,\nI leave the door unlocked." },
    { sourceRecordId: "b", poem: "Snow Theory", excerpt: "Snow is a sentient being that hates when people drive in straight lines." },
    { sourceRecordId: "c", poem: "New", excerpt: "Completely new words that nobody has pulled before." },
  ];
  const existing = [
    { id: "OND-EXC-OCD", excerpt: "“I want her back so bad, I leave the door unlocked.”" },
    { id: "OND-EXC-SNOW-THEORY", excerpt: "Snow is a sentient being that hates when people drive in straight lines. Snow is migratory." },
    { id: "OND-EXC-OLD", sourceRecordId: "c", excerpt: "different text" },
  ];
  const plan = planExcerptBatch(records, existing);
  assert.deepEqual(plan.map((row) => row.status), ["exists", "new", "exists"]);
  assert.deepEqual(plan[0].existingIds, ["OND-EXC-OCD"]);
  assert.deepEqual(plan[1].overlappingIds, ["OND-EXC-SNOW-THEORY"]);
  assert.deepEqual(plan[2].existingIds, ["OND-EXC-OLD"]);
});
