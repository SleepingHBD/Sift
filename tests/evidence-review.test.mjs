import assert from "node:assert/strict";
import test from "node:test";
import { evidenceReviewMutation } from "../lib/evidence/review.ts";

test("review mutations timestamp explicit classifications", () => {
  assert.deepEqual(evidenceReviewMutation("relevant", new Date("2026-08-08T04:00:00.000Z")), {
    review_status: "relevant",
    reviewed_at: "2026-08-08T04:00:00.000Z",
  });
  assert.deepEqual(evidenceReviewMutation("archived", new Date("2026-08-08T04:30:00.000Z")), {
    review_status: "archived",
    reviewed_at: "2026-08-08T04:30:00.000Z",
  });
});

test("resetting evidence to needs review clears the previous review timestamp", () => {
  assert.deepEqual(evidenceReviewMutation("unreviewed", new Date("2026-08-08T05:00:00.000Z")), {
    review_status: "unreviewed",
    reviewed_at: null,
  });
});
