import { withSupabase } from "npm:@supabase/server@1.4.1";
import {
  normalizeStrategyEvidenceRow,
  strategyEvidenceSearchText,
  validateStrategyEvidencePreviewRequest,
} from "../_shared/strategy-ai.ts";

const MAX_REQUEST_BYTES = 24_000;

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    const declaredLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return Response.json({ error: "The Strategy AI request is too large." }, { status: 413 });
    }

    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
        return Response.json({ error: "The Strategy AI request is too large." }, { status: 413 });
      }
      const input = validateStrategyEvidencePreviewRequest(JSON.parse(rawBody));
      const access = await context.supabase
        .from("projects")
        .select("id,name")
        .eq("id", input.projectId)
        .maybeSingle();
      if (access.error) throw new StrategyAiRequestError(`Project access could not be verified: ${access.error.message}`, 500);
      if (!access.data) throw new StrategyAiRequestError("The selected project is not available to this account.", 403);

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
      if (searchResult.error) throw new StrategyAiRequestError(`Evidence retrieval failed: ${searchResult.error.message}`, 500);
      if (statsResult.error) throw new StrategyAiRequestError(`Evidence coverage could not be loaded: ${statsResult.error.message}`, 500);

      const evidence = (searchResult.data ?? [])
        .map(normalizeStrategyEvidenceRow)
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .slice(0, input.limit);
      const totalEvidence = Number(statsResult.data?.total_count) || 0;

      return Response.json({
        mode: "workspace_backed",
        project: { id: access.data.id, name: access.data.name },
        question: input.question,
        searchText,
        evidence,
        coverage: {
          selectedCandidates: evidence.length,
          totalEvidence,
          excludedReviewStatuses: ["irrelevant", "archived"],
        },
        limitations: evidence.length
          ? ["This is a deterministic full-text retrieval preview. No AI conclusion has been generated."]
          : ["No eligible source matched these search terms. Broaden the question or add more project evidence."],
      });
    } catch (error) {
      const status = error instanceof StrategyAiRequestError ? error.status : 400;
      const message = error instanceof Error && error.message ? error.message : "The Strategy AI evidence preview failed.";
      return Response.json({ error: message }, { status });
    }
  }),
};

class StrategyAiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
