import type { EvidenceReference } from "@/lib/evidence/reference";
import { evidenceReviewMutation } from "@/lib/evidence/review";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { EvidenceReviewStatus } from "@/lib/types";

const sourceTables = {
  mention: "mentions",
  research: "research_items",
  inspiration: "inspiration_items",
} as const;

export interface EvidenceReviewUpdate {
  reviewStatus: EvidenceReviewStatus;
  reviewedAt: string | null;
}

export async function updateEvidenceReviewStatus(
  evidence: EvidenceReference,
  reviewStatus: EvidenceReviewStatus,
): Promise<EvidenceReviewUpdate> {
  if (!evidence.cloudId) throw new Error("This evidence record is not stored in the cloud yet.");
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  const mutation = evidenceReviewMutation(reviewStatus);
  const { data, error } = await client
    .from(sourceTables[evidence.kind])
    .update(mutation)
    .eq("id", evidence.cloudId)
    .eq("project_id", evidence.projectId)
    .select("review_status,reviewed_at")
    .maybeSingle();

  if (error) throw new Error(`Review status could not be saved: ${error.message}`);
  if (!data) throw new Error("Review status was not saved because this account cannot update the source record.");
  return {
    reviewStatus: data.review_status as EvidenceReviewStatus,
    reviewedAt: data.reviewed_at,
  };
}
