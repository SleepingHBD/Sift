import { withSupabase } from "npm:@supabase/server@1.4.1";
import {
  buildStrategyOpenAiRequest,
  normalizeStrategyEvidenceRow,
  parseStrategyOpenAiResponse,
  strategyEvidenceSearchText,
  strategySafetyIdentifier,
  validateStrategyAnalysisRequest,
  validateStrategyEvidencePreviewRequest,
  type StrategyEvidencePreviewItem,
  type StrategyStructuredResponse,
} from "../_shared/strategy-ai.ts";

const MAX_REQUEST_BYTES = 24_000;
const OPENAI_TIMEOUT_MS = 45_000;

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    const declaredLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return Response.json({ error: "The Strategy AI request is too large." }, { status: 413 });
    }

    try {
      if (request.method !== "POST") throw new StrategyAiRequestError("Method not allowed.", 405, "METHOD_NOT_ALLOWED");
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
        return Response.json({ error: "The Strategy AI request is too large." }, { status: 413 });
      }
      const body = JSON.parse(rawBody);
      const userId = authenticatedUserId(context);

      if (body?.action === "preview-evidence") {
        const input = validateStrategyEvidencePreviewRequest(body);
        const project = await requireProjectAccess(context.supabase, input.projectId);
        const searchText = strategyEvidenceSearchText(input.question);
        const retrievalSize = Math.min(Math.max(input.limit * 4, 24), 100);
        const [searchResult, statsResult] = await Promise.all([
          context.supabase.rpc("search_evidence_page", {
            p_search: searchText,
            p_project_id: input.projectId,
            p_sort: "newest",
            p_page_size: retrievalSize,
          }),
          context.supabase.rpc("evidence_inbox_stats", { p_project_id: input.projectId }).single(),
        ]);
        if (searchResult.error) throw new StrategyAiRequestError(`Evidence retrieval failed: ${searchResult.error.message}`, 500, "RETRIEVAL_FAILED");
        if (statsResult.error) throw new StrategyAiRequestError(`Evidence coverage could not be loaded: ${statsResult.error.message}`, 500, "COVERAGE_FAILED");

        const evidence = normalizeEvidenceRows(searchResult.data).slice(0, input.limit);
        const totalEvidence = Number(statsResult.data?.total_count) || 0;
        const model = modelConfiguration();
        return Response.json({
          mode: "workspace_backed",
          project,
          question: input.question,
          searchText,
          evidence,
          coverage: {
            selectedCandidates: evidence.length,
            totalEvidence,
            excludedReviewStatuses: ["irrelevant", "archived"],
          },
          analysis: {
            available: model.available,
            reason: model.available ? null : "Secure model generation has not been activated yet.",
          },
          limitations: evidence.length
            ? ["This is a deterministic full-text retrieval preview. No AI conclusion has been generated."]
            : ["No eligible source matched these search terms. Broaden the question or add more project evidence."],
        });
      }

      if (body?.action === "analyze") {
        const input = validateStrategyAnalysisRequest(body);
        const project = await requireProjectAccess(context.supabase, input.projectId);
        const model = modelConfiguration();
        if (!model.available) {
          throw new StrategyAiRequestError("Secure model generation has not been activated yet.", 503, "MODEL_NOT_CONFIGURED");
        }

        const evidenceResult = await context.supabase.rpc("resolve_strategy_evidence", {
          p_project_id: input.projectId,
          p_identities: input.evidenceIdentities,
        });
        if (evidenceResult.error) throw new StrategyAiRequestError(`Selected evidence could not be verified: ${evidenceResult.error.message}`, 500, "EVIDENCE_REVALIDATION_FAILED");
        const evidence = normalizeEvidenceRows(evidenceResult.data);
        const resolved = new Set(evidence.map((item) => item.identity));
        const missing = input.evidenceIdentities.filter((identity) => !resolved.has(identity));
        if (missing.length) {
          throw new StrategyAiRequestError("The selected evidence changed or is no longer eligible. Refresh the evidence preview before trying again.", 409, "EVIDENCE_SCOPE_CHANGED");
        }
        const orderedEvidence = input.evidenceIdentities.map((identity) => evidence.find((item) => item.identity === identity)!);
        const safetyIdentifier = await strategySafetyIdentifier(userId);
        const openAiResult = await requestOpenAiAnalysis(model.apiKey, buildStrategyOpenAiRequest({
          model: model.model,
          question: input.question,
          evidence: orderedEvidence,
          safetyIdentifier,
        }), input.evidenceIdentities);
        const citations = buildPersistedCitations(openAiResult.analysis, orderedEvidence);
        const sourceScope = {
          projectId: input.projectId,
          question: input.question,
          searchText: strategyEvidenceSearchText(input.question),
          evidenceIdentities: input.evidenceIdentities,
          excludedReviewStatuses: ["irrelevant", "archived"],
          clientRequestId: input.clientRequestId,
        };
        const persistence = await context.supabaseAdmin.rpc("persist_strategy_analysis", {
          p_user_id: userId,
          p_project_id: input.projectId,
          p_client_request_id: input.clientRequestId,
          p_title: input.question,
          p_source_scope: sourceScope,
          p_question: input.question,
          p_structured_response: openAiResult.analysis,
          p_structured_claims: openAiResult.analysis.claims,
          p_citations: citations,
          p_model: openAiResult.model,
          p_request_id: openAiResult.requestId,
          p_usage: { ...openAiResult.usage, response_id: openAiResult.responseId },
        });
        if (persistence.error) throw new StrategyAiRequestError(`The cited analysis could not be saved: ${persistence.error.message}`, 500, "PERSISTENCE_FAILED");
        const stored = record(persistence.data);

        return Response.json({
          mode: "workspace_backed",
          project,
          question: input.question,
          conversationId: text(stored.conversationId),
          assistantMessageId: text(stored.assistantMessageId),
          analysis: openAiResult.analysis,
          citations,
          sources: orderedEvidence,
          model: openAiResult.model,
          requestId: openAiResult.requestId,
          usage: openAiResult.usage,
        });
      }

      throw new StrategyAiRequestError("The Strategy AI action is not supported.", 400, "UNSUPPORTED_ACTION");
    } catch (error) {
      const status = error instanceof StrategyAiRequestError ? error.status : 400;
      const code = error instanceof StrategyAiRequestError ? error.code : "INVALID_REQUEST";
      const message = error instanceof Error && error.message ? error.message : "The Strategy AI request failed.";
      return Response.json({ error: message, code }, { status });
    }
  }),
};

async function requireProjectAccess(client: StrategySupabaseClient, projectId: string) {
  const access = await client.from("projects").select("id,name").eq("id", projectId).maybeSingle();
  if (access.error) throw new StrategyAiRequestError(`Project access could not be verified: ${access.error.message}`, 500, "PROJECT_CHECK_FAILED");
  if (!access.data) throw new StrategyAiRequestError("The selected project is not available to this account.", 403, "PROJECT_FORBIDDEN");
  return { id: String(access.data.id), name: String(access.data.name) };
}

async function requestOpenAiAnalysis(apiKey: string, payload: unknown, evidenceIdentities: string[]) {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new StrategyAiRequestError(timedOut ? "The model request timed out before any analysis was saved." : "The secure model service could not be reached.", timedOut ? 504 : 502, timedOut ? "MODEL_TIMEOUT" : "MODEL_UNAVAILABLE");
  }

  const requestId = response.headers.get("x-request-id");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StrategyAiRequestError("The model service returned an unreadable response.", 502, "MODEL_BAD_RESPONSE");
  }
  if (!response.ok) {
    const providerCode = text(record(record(body).error).code);
    console.error("Strategy AI model request failed", { status: response.status, requestId, providerCode });
    throw new StrategyAiRequestError("The model service rejected the request. No analysis was saved.", response.status === 429 ? 429 : 502, response.status === 429 ? "MODEL_RATE_LIMITED" : "MODEL_REJECTED");
  }
  try {
    return parseStrategyOpenAiResponse(body, requestId, evidenceIdentities);
  } catch (error) {
    console.error("Strategy AI structured response validation failed", { requestId, message: error instanceof Error ? error.message : "Unknown validation error" });
    throw new StrategyAiRequestError("The model response did not satisfy Sift's citation and structure requirements. No analysis was saved.", 502, "MODEL_OUTPUT_REJECTED");
  }
}

function buildPersistedCitations(analysis: StrategyStructuredResponse, evidence: StrategyEvidencePreviewItem[]) {
  const sourceById = new Map(evidence.map((source) => [source.identity, source]));
  const citations: Array<Record<string, unknown>> = [];
  for (const claim of analysis.claims) {
    for (const evidenceIdentity of claim.evidenceIds) {
      const source = sourceById.get(evidenceIdentity)!;
      citations.push({
        claimId: claim.id,
        classification: claim.classification,
        evidenceIdentity,
        evidenceKind: source.kind,
        evidenceId: source.id,
        title: source.title,
        sourceLabel: source.sourceLabel,
        originalUrl: source.originalUrl,
      });
    }
  }
  analysis.tensions.forEach((tension, index) => {
    for (const evidenceIdentity of tension.evidenceIds) {
      const source = sourceById.get(evidenceIdentity)!;
      citations.push({
        claimId: `tension_${index + 1}`,
        classification: "tension",
        evidenceIdentity,
        evidenceKind: source.kind,
        evidenceId: source.id,
        title: source.title,
        sourceLabel: source.sourceLabel,
        originalUrl: source.originalUrl,
      });
    }
  });
  return citations;
}

function normalizeEvidenceRows(value: unknown): StrategyEvidencePreviewItem[] {
  return (Array.isArray(value) ? value : [])
    .map(normalizeStrategyEvidenceRow)
    .filter((item): item is StrategyEvidencePreviewItem => Boolean(item));
}

function modelConfiguration(): { available: false; apiKey: ""; model: "" } | { available: true; apiKey: string; model: string } {
  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim() || "";
  const model = Deno.env.get("OPENAI_STRATEGY_MODEL")?.trim() || "";
  return apiKey && model ? { available: true, apiKey, model } : { available: false, apiKey: "", model: "" };
}

function authenticatedUserId(context: { authMode: string; userClaims: Record<string, unknown> }) {
  if (context.authMode !== "user") throw new StrategyAiRequestError("An authenticated user session is required.", 401, "AUTH_REQUIRED");
  const userId = String(context.userClaims.sub || context.userClaims.id || "");
  if (!userId) throw new StrategyAiRequestError("The authenticated user ID is unavailable.", 401, "AUTH_REQUIRED");
  return userId;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

interface StrategySupabaseClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
}

class StrategyAiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}
