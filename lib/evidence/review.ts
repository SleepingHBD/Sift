import type { EvidenceReviewStatus } from "../types.ts";

export function evidenceReviewMutation(reviewStatus: EvidenceReviewStatus, now = new Date()) {
  return {
    review_status: reviewStatus,
    reviewed_at: reviewStatus === "unreviewed" ? null : now.toISOString(),
  };
}
