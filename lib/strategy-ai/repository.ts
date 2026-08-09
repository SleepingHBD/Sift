import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Project } from "@/lib/types";
import type {
  StrategyAnalysisResult,
  StrategyCitation,
  StrategyClaim,
  StrategyEvidencePreview,
  StrategyEvidencePreviewItem,
  StrategyStructuredResponse,
  StrategyTension,
} from "./types";

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

export async function generateStrategyAnalysis(
  project: Project,
  question: string,
  evidenceIdentities: string[],
  clientRequestId: string,
): Promise<StrategyAnalysisResult> {
  if (!project.cloudId) throw new Error("Choose a project that is available in your cloud workspace.");
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Sign in with GitHub before generating workspace-backed analysis.");

  client.functions.setAuth(accessToken);
  const functionName = process.env.NEXT_PUBLIC_STRATEGY_AI_FUNCTION_NAME || "strategy-ai";
  const { data, error } = await client.functions.invoke(functionName, {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { action: "analyze", projectId: project.cloudId, question, evidenceIdentities, clientRequestId },
  });
  if (error) throw new Error(await readFunctionError(error));
  if (!isStrategyAnalysisResult(data)) throw new Error("The Strategy AI service returned an invalid cited analysis.");
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
    && Boolean(preview.analysis && typeof preview.analysis.available === "boolean")
    && Array.isArray(preview.limitations)
    && preview.limitations.every((item) => typeof item === "string");
}

function isStrategyAnalysisResult(value: unknown): value is StrategyAnalysisResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<StrategyAnalysisResult>;
  return result.mode === "workspace_backed"
    && Boolean(result.project && typeof result.project.id === "string" && typeof result.project.name === "string")
    && typeof result.question === "string"
    && typeof result.conversationId === "string"
    && typeof result.assistantMessageId === "string"
    && typeof result.model === "string"
    && typeof result.requestId === "string"
    && isStrategyStructuredResponse(result.analysis)
    && Array.isArray(result.citations)
    && result.citations.every(isStrategyCitation)
    && Array.isArray(result.sources)
    && result.sources.every(isStrategyEvidencePreviewItem)
    && Boolean(result.usage && typeof result.usage === "object");
}

function isStrategyStructuredResponse(value: unknown): value is StrategyStructuredResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<StrategyStructuredResponse>;
  return typeof response.summary === "string"
    && Array.isArray(response.claims)
    && response.claims.every(isStrategyClaim)
    && Array.isArray(response.tensions)
    && response.tensions.every(isStrategyTension)
    && isStringArray(response.evidenceGaps)
    && isStringArray(response.nextQuestions)
    && isStringArray(response.limitations);
}

function isStrategyClaim(value: unknown): value is StrategyClaim {
  if (!value || typeof value !== "object") return false;
  const claim = value as Partial<StrategyClaim>;
  return typeof claim.id === "string"
    && (claim.classification === "measured_fact" || claim.classification === "interpretation" || claim.classification === "hypothesis" || claim.classification === "recommendation")
    && typeof claim.statement === "string"
    && typeof claim.whyItMatters === "string"
    && isStringArray(claim.evidenceIds)
    && (claim.confidence === "high" || claim.confidence === "medium" || claim.confidence === "low")
    && typeof claim.caveat === "string";
}

function isStrategyTension(value: unknown): value is StrategyTension {
  if (!value || typeof value !== "object") return false;
  const tension = value as Partial<StrategyTension>;
  return typeof tension.description === "string"
    && typeof tension.implication === "string"
    && isStringArray(tension.evidenceIds);
}

function isStrategyCitation(value: unknown): value is StrategyCitation {
  if (!value || typeof value !== "object") return false;
  const citation = value as Partial<StrategyCitation>;
  return typeof citation.claimId === "string"
    && typeof citation.evidenceIdentity === "string"
    && (citation.evidenceKind === "mention" || citation.evidenceKind === "research" || citation.evidenceKind === "inspiration")
    && typeof citation.evidenceId === "string"
    && typeof citation.title === "string"
    && typeof citation.sourceLabel === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
