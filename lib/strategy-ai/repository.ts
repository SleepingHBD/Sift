import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Project } from "@/lib/types";
import type { StrategyEvidencePreview, StrategyEvidencePreviewItem } from "./types";

export async function previewStrategyEvidence(
  project: Project,
  question: string,
  limit = 8,
): Promise<StrategyEvidencePreview> {
  if (!project.cloudId) throw new Error("Choose a project that is available in your cloud workspace.");
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Sign in with GitHub before preparing workspace evidence.");

  client.functions.setAuth(accessToken);
  const functionName = process.env.NEXT_PUBLIC_STRATEGY_AI_FUNCTION_NAME || "strategy-ai";
  const { data, error } = await client.functions.invoke(functionName, {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { action: "preview-evidence", projectId: project.cloudId, question, limit },
  });
  if (error) throw new Error(await readFunctionError(error));
  if (!isStrategyEvidencePreview(data)) throw new Error("The Strategy AI evidence service returned an invalid response.");
  return data;
}

async function readFunctionError(error: { message: string; context?: unknown }) {
  const response = error.context;
  if (response instanceof Response) {
    try {
      const body = await response.json() as { error?: string };
      if (body.error) return body.error;
    } catch {
      // Fall back to the SDK error message when the response is not JSON.
    }
  }
  return error.message;
}

function isStrategyEvidencePreviewItem(value: unknown): value is StrategyEvidencePreviewItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StrategyEvidencePreviewItem>;
  return typeof item.identity === "string"
    && typeof item.id === "string"
    && (item.kind === "mention" || item.kind === "research" || item.kind === "inspiration")
    && typeof item.projectId === "string"
    && typeof item.title === "string"
    && typeof item.sourceLabel === "string"
    && typeof item.capturedAt === "string";
}

function isStrategyEvidencePreview(value: unknown): value is StrategyEvidencePreview {
  if (!value || typeof value !== "object") return false;
  const preview = value as Partial<StrategyEvidencePreview>;
  return preview.mode === "workspace_backed"
    && Boolean(preview.project && typeof preview.project.id === "string" && typeof preview.project.name === "string")
    && typeof preview.question === "string"
    && typeof preview.searchText === "string"
    && Array.isArray(preview.evidence)
    && preview.evidence.every(isStrategyEvidencePreviewItem)
    && Boolean(preview.coverage && typeof preview.coverage.totalEvidence === "number")
    && Array.isArray(preview.limitations)
    && preview.limitations.every((item) => typeof item === "string");
}
