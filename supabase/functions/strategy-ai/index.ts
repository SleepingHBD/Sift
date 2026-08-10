import { withSupabase } from "npm:@supabase/server@1.4.1";
import {
  buildStrategyOpenAiRequest,
  normalizeStrategyEvidenceRow,
  parseStrategyOpenAiResponse,
  rankStrategyEvidenceForPreview,
  strategyBudgetConfiguration,
  strategyEvidenceSearchText,
  strategyEvidenceSearchTerms,
  strategySafetyIdentifier,
  STRATEGY_TOKEN_RESERVATION,
  validateStrategyAnalysisRequest,
  validateStrategyEvidencePreviewRequest,
  validateStrategyImportAnalysisRequest,
  type StrategyBudgetConfiguration,
  type StrategyEvidencePreviewItem,
  type StrategyStructuredResponse,
} from "../_shared/strategy-ai.ts";

const MAX_REQUEST_BYTES = 64_000;
const OPENAI_TIMEOUT_MS = 45_000;
const MANUAL_CHATGPT_MODEL = "ChatGPT manual handoff";

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
        const searchTerms = strategyEvidenceSearchTerms(input.question);
        const retrievalSize = Math.min(Math.max(input.limit * 8, 48), 100);
        const statsResult = await context.supabase.rpc("evidence_inbox_stats", { p_project_id: input.projectId }).single();
        if (statsResult.error) throw new StrategyAiRequestError(`Evidence coverage could not be loaded: ${statsResult.error.message}`, 500, "COVERAGE_FAILED");

        let directEvidence: StrategyEvidencePreviewItem[] = [];
        if (searchTerms.length) {
          const searchResult = await context.supabase.rpc("search_evidence_page", {
            p_search: searchText,
            p_project_id: input.projectId,
            p_sort: "newest",
            p_page_size: retrievalSize,
          });
          if (searchResult.error) throw new StrategyAiRequestError(`Evidence retrieval failed: ${searchResult.error.message}`, 500, "RETRIEVAL_FAILED");
          directEvidence = normalizeEvidenceRows(searchResult.data);
        }

        const totalEvidence = Number(statsResult.data?.total_count) || 0;
        let fallbackEvidence: StrategyEvidencePreviewItem[] = [];
        if (directEvidence.length < input.limit && totalEvidence > directEvidence.length) {
          const fallbackResult = await context.supabase.rpc("search_evidence_page", {
            p_search: null,
            p_project_id: input.projectId,
            p_sort: "newest",
            p_page_size: retrievalSize,
          });
          if (fallbackResult.error) throw new StrategyAiRequestError(`Project evidence fallback failed: ${fallbackResult.error.message}`, 500, "FALLBACK_RETRIEVAL_FAILED");
          fallbackEvidence = normalizeEvidenceRows(fallbackResult.data);
        }
        const evidence = rankStrategyEvidenceForPreview({
          direct: directEvidence,
          fallback: fallbackEvidence,
          question: input.question,
          limit: input.limit,
        });
        const matchedEvidence = evidence.filter((item) => item.retrievalTier !== "project_context").length;
        const contextualEvidence = evidence.length - matchedEvidence;
        const model = modelConfiguration();
        const budget = await loadStrategyBudgetStatus(context.supabaseAdmin, userId, model.budget);
        const analysisAvailable = model.modelConfigured && budget.configured && budget.available;
        const analysisReason = !model.modelConfigured
          ? "Secure model generation has not been activated yet."
          : !budget.configured
            ? model.budget.reason
            : budget.reason;
        return Response.json({
          mode: "workspace_backed",
          project,
          question: input.question,
          searchText,
          evidence,
          coverage: {
            selectedCandidates: evidence.length,
            totalEvidence,
            matchedEvidence,
            contextualEvidence,
            excludedReviewStatuses: ["irrelevant", "archived"],
          },
          analysis: {
            available: analysisAvailable,
            reason: analysisAvailable ? null : analysisReason,
            modelConfigured: model.modelConfigured,
            budget,
          },
          limitations: matchedEvidence
            ? [contextualEvidence
              ? "Direct and partial text matches are selected by default. Additional project context is shown separately for manual review. No AI conclusion has been generated."
              : "This is a deterministic relevance preview. No AI conclusion has been generated."]
            : contextualEvidence
              ? ["No direct textual match was found. Other eligible project evidence is shown for manual selection and is not treated as relevant automatically."]
              : ["This project has no eligible evidence to retrieve. Add evidence or review its status before preparing a prompt."],
        });
      }

      if (body?.action === "import-analysis") {
        const input = validateStrategyImportAnalysisRequest(body);
        const project = await requireProjectAccess(context.supabase, input.projectId);
        const evidenceResult = await context.supabase.rpc("resolve_strategy_evidence", {
          p_project_id: input.projectId,
          p_identities: input.evidenceIdentities,
        });
        if (evidenceResult.error) throw new StrategyAiRequestError(`Selected evidence could not be verified: ${evidenceResult.error.message}`, 500, "EVIDENCE_REVALIDATION_FAILED");
        const evidence = normalizeEvidenceRows(evidenceResult.data);
        const resolved = new Set(evidence.map((item) => item.identity));
        const missing = input.evidenceIdentities.filter((identity) => !resolved.has(identity));
        if (missing.length) {
          throw new StrategyAiRequestError("The selected evidence changed or is no longer eligible. Prepare the ChatGPT handoff again before saving.", 409, "EVIDENCE_SCOPE_CHANGED");
        }

        const orderedEvidence = input.evidenceIdentities.map((identity) => evidence.find((item) => item.identity === identity)!);
        const citations = buildPersistedCitations(input.structuredResponse, orderedEvidence);
        const requestId = `manual:${input.clientRequestId}`;
        const sourceScope = {
          projectId: input.projectId,
          question: input.question,
          searchText: strategyEvidenceSearchText(input.question),
          evidenceIdentities: input.evidenceIdentities,
          excludedReviewStatuses: ["irrelevant", "archived"],
          clientRequestId: input.clientRequestId,
          handoff: "chatgpt_manual",
        };
        const persistence = await context.supabaseAdmin.rpc("persist_strategy_analysis", {
          p_user_id: userId,
          p_project_id: input.projectId,
          p_client_request_id: input.clientRequestId,
          p_title: input.question,
          p_source_scope: sourceScope,
          p_question: input.question,
          p_structured_response: input.structuredResponse,
          p_structured_claims: input.structuredResponse.claims,
          p_citations: citations,
          p_model: MANUAL_CHATGPT_MODEL,
          p_request_id: requestId,
          p_usage: { mode: "manual_handoff", token_usage_available: false },
        });
        if (persistence.error) throw new StrategyAiRequestError(`The cited analysis could not be saved: ${persistence.error.message}`, 500, "PERSISTENCE_FAILED");
        const stored = record(persistence.data);

        return Response.json({
          mode: "workspace_backed",
          origin: "chatgpt_manual",
          project,
          question: input.question,
          conversationId: text(stored.conversationId),
          assistantMessageId: text(stored.assistantMessageId),
          analysis: input.structuredResponse,
          citations,
          sources: orderedEvidence,
          model: MANUAL_CHATGPT_MODEL,
          requestId,
          usage: {},
        });
      }

      if (body?.action === "analyze") {
        const input = validateStrategyAnalysisRequest(body);
        const project = await requireProjectAccess(context.supabase, input.projectId);
        const model = modelConfiguration();
        if (!model.modelConfigured) {
          throw new StrategyAiRequestError("Secure model generation has not been activated yet.", 503, "MODEL_NOT_CONFIGURED");
        }
        if (!model.budget.configured || model.budget.monthlyRequestLimit === null || model.budget.monthlyTokenLimit === null) {
          throw new StrategyAiRequestError(model.budget.reason || "Server-side Strategy AI usage limits are not configured.", 503, "BUDGET_NOT_CONFIGURED");
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
        const modelRequest = buildStrategyOpenAiRequest({
          model: model.model,
          question: input.question,
          evidence: orderedEvidence,
          safetyIdentifier,
        });
        const reservationResult = await context.supabaseAdmin.rpc("reserve_strategy_ai_budget", {
          p_user_id: userId,
          p_client_request_id: input.clientRequestId,
          p_model: model.model,
          p_monthly_request_limit: model.budget.monthlyRequestLimit,
          p_monthly_token_limit: model.budget.monthlyTokenLimit,
          p_token_reserve: model.budget.tokenReservation,
        });
        if (reservationResult.error) throw new StrategyAiRequestError(`The Strategy AI allowance could not be reserved: ${reservationResult.error.message}`, 500, "BUDGET_RESERVATION_FAILED");
        const reservation = record(reservationResult.data);
        if (reservation.allowed !== true) {
          throw new StrategyAiRequestError(text(reservation.reason) || "The monthly Strategy AI allowance has been reached.", 429, "BUDGET_EXHAUSTED");
        }
        const reservedTokens = Number(reservation.reservedTokens) || STRATEGY_TOKEN_RESERVATION;
        let usageRecorded = false;

        try {
          const openAiResult = await requestOpenAiAnalysis(model.apiKey, modelRequest, input.evidenceIdentities);
          const usageResult = await context.supabaseAdmin.rpc("complete_strategy_ai_budget", {
            p_user_id: userId,
            p_client_request_id: input.clientRequestId,
            p_actual_tokens: openAiResult.usage.total_tokens,
            p_usage: { ...openAiResult.usage, response_id: openAiResult.responseId, request_id: openAiResult.requestId },
            p_failure_code: null,
          });
          if (usageResult.error) throw new StrategyAiRequestError(`Strategy AI usage could not be recorded: ${usageResult.error.message}`, 500, "BUDGET_ACCOUNTING_FAILED");
          usageRecorded = true;

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
          const budgetAfter = await loadStrategyBudgetStatus(context.supabaseAdmin, userId, model.budget);

          return Response.json({
            mode: "workspace_backed",
            origin: "openai_api",
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
            budget: budgetAfter,
          });
        } catch (error) {
          if (!usageRecorded) {
            await recordFailedBudgetAttempt(
              context.supabaseAdmin,
              userId,
              input.clientRequestId,
              reservedTokens,
              error instanceof StrategyAiRequestError ? error.code : "MODEL_ATTEMPT_FAILED",
            );
          }
          throw error;
        }
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

function modelConfiguration() {
  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim() || "";
  const model = Deno.env.get("OPENAI_STRATEGY_MODEL")?.trim() || "";
  const budget = strategyBudgetConfiguration({
    monthlyRequestLimit: Deno.env.get("STRATEGY_AI_MONTHLY_REQUEST_LIMIT"),
    monthlyTokenLimit: Deno.env.get("STRATEGY_AI_MONTHLY_TOKEN_LIMIT"),
  });
  return { apiKey, model, modelConfigured: Boolean(apiKey && model), budget };
}

async function loadStrategyBudgetStatus(client: StrategyAdminClient, userId: string, configuration: StrategyBudgetConfiguration): Promise<StrategyBudgetStatus> {
  if (!configuration.configured || configuration.monthlyRequestLimit === null || configuration.monthlyTokenLimit === null) {
    return {
      configured: false,
      available: false,
      reason: configuration.reason,
      periodStart: null,
      periodEnd: null,
      monthlyRequestLimit: null,
      monthlyTokenLimit: null,
      completedRequests: 0,
      failedRequests: 0,
      activeReservations: 0,
      usedRequests: 0,
      usedTokens: 0,
      reservedTokens: 0,
      remainingRequests: 0,
      remainingTokens: 0,
      nextRequestReservationTokens: configuration.tokenReservation,
    };
  }
  const result = await client.rpc("strategy_ai_budget_status", {
    p_user_id: userId,
    p_monthly_request_limit: configuration.monthlyRequestLimit,
    p_monthly_token_limit: configuration.monthlyTokenLimit,
    p_token_reserve: configuration.tokenReservation,
  });
  if (result.error) throw new StrategyAiRequestError(`Strategy AI usage limits could not be checked: ${result.error.message}`, 500, "BUDGET_STATUS_FAILED");
  const value = record(result.data);
  return {
    configured: value.configured === true,
    available: value.available === true,
    reason: text(value.reason) || null,
    periodStart: text(value.periodStart) || null,
    periodEnd: text(value.periodEnd) || null,
    monthlyRequestLimit: numberOrZero(value.monthlyRequestLimit),
    monthlyTokenLimit: numberOrZero(value.monthlyTokenLimit),
    completedRequests: numberOrZero(value.completedRequests),
    failedRequests: numberOrZero(value.failedRequests),
    activeReservations: numberOrZero(value.activeReservations),
    usedRequests: numberOrZero(value.usedRequests),
    usedTokens: numberOrZero(value.usedTokens),
    reservedTokens: numberOrZero(value.reservedTokens),
    remainingRequests: numberOrZero(value.remainingRequests),
    remainingTokens: numberOrZero(value.remainingTokens),
    nextRequestReservationTokens: numberOrZero(value.nextRequestReservationTokens),
  };
}

async function recordFailedBudgetAttempt(
  client: StrategyAdminClient,
  userId: string,
  clientRequestId: string,
  reservedTokens: number,
  failureCode: string,
) {
  const result = await client.rpc("complete_strategy_ai_budget", {
    p_user_id: userId,
    p_client_request_id: clientRequestId,
    p_actual_tokens: reservedTokens,
    p_usage: {
      estimated: true,
      reserved_tokens: reservedTokens,
      reason: "Provider usage was unavailable, so Sift conservatively counted the full protected reservation.",
    },
    p_failure_code: failureCode,
  });
  if (result.error) {
    console.error("Strategy AI failed-attempt usage could not be recorded", { code: failureCode, message: result.error.message });
  }
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

function numberOrZero(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.trunc(amount) : 0;
}

interface StrategyBudgetStatus {
  configured: boolean;
  available: boolean;
  reason: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  monthlyRequestLimit: number | null;
  monthlyTokenLimit: number | null;
  completedRequests: number;
  failedRequests: number;
  activeReservations: number;
  usedRequests: number;
  usedTokens: number;
  reservedTokens: number;
  remainingRequests: number;
  remainingTokens: number;
  nextRequestReservationTokens: number;
}

interface StrategyAdminClient {
  rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
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
