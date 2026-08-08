import { withSupabase } from "npm:@supabase/server@1.4.1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { deleteStoredMonitor, persistCollection } from "../_shared/database.ts";
import { createConnectorRegistry } from "../_shared/registry.ts";
import type { ConnectorSource, DeleteMonitorRequest, ExtractUrlRequest, NormalizedMention, ProjectInput, RunRequest, SourceRunResult } from "../_shared/types.ts";
import { comparableUrl, extractUrlMetadata } from "../_shared/url-metadata.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    const declaredLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > 65_536) {
      return Response.json({ error: "The connector request is too large." }, { status: 413 });
    }

    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > 65_536) {
        return Response.json({ error: "The connector request is too large." }, { status: 413 });
      }
      const body = JSON.parse(rawBody);
      const userId = authenticatedUserId(context);
      if (isExtractUrlAction(body)) {
        const input = validateExtractUrlRequest(body);
        const access = await context.supabase.from("projects").select("id").eq("id", input.projectId).maybeSingle();
        if (access.error) throw new Error(`Project access could not be verified: ${access.error.message}`);
        if (!access.data) return Response.json({ error: "The selected project is not available to this account." }, { status: 403 });

        const quota = await consumeEvidenceExtractionQuota(context.supabaseAdmin, userId);
        if (!quota.allowed) {
          return Response.json(
            { error: "Link inspection limit reached. You can still save the URL without metadata.", retryAfterSeconds: quota.retryAfterSeconds },
            { status: 429, headers: { "Retry-After": String(quota.retryAfterSeconds) } },
          );
        }

        const metadata = await extractUrlMetadata(input.url);
        const duplicate = await findDuplicateEvidence(context.supabase, input.projectId, [
          metadata.originalUrl,
          metadata.finalUrl,
          metadata.canonicalUrl,
        ]);
        return Response.json({ metadata, duplicate });
      }
      if (isDeleteMonitorAction(body)) {
        const input = validateDeleteMonitorRequest(body);
        const result = await deleteStoredMonitor(context.supabaseAdmin, userId, input.monitorId, input.project);
        return Response.json(result);
      }

      const input = validateRunRequest(body);
      let quota: RadarQuota;
      try {
        quota = await consumeRadarQuota(context.supabaseAdmin, userId);
      } catch (error) {
        console.error("Radar quota check failed", errorMessage(error, "Quota check failed."));
        return Response.json({ error: "Radar is temporarily unavailable. Please try again shortly." }, { status: 503 });
      }
      if (!quota.allowed) {
        return Response.json(
          {
            error: "Radar run limit reached. Please wait before running this monitor again.",
            retryAfterSeconds: quota.retryAfterSeconds,
          },
          { status: 429, headers: { "Retry-After": String(quota.retryAfterSeconds) } },
        );
      }

      const startedAt = new Date().toISOString();
      const mentions: NormalizedMention[] = [];
      const sourceResults: SourceRunResult[] = [];
      const registry = createConnectorRegistry(input, { youtubeApiKey: Deno.env.get("YOUTUBE_API_KEY") || "" });

      for (const source of input.monitor.sources) {
        const connector = registry.get(source);
        if (!connector) {
          sourceResults.push({ source, status: "failed", count: 0, message: "This connector is not implemented." });
          continue;
        }
        try {
          const collected = await connector.collect();
          mentions.push(...collected.mentions);
          sourceResults.push(collected.result);
        } catch (error) {
          sourceResults.push({ source, status: "failed", count: 0, message: error instanceof Error ? error.message : `${source} retrieval failed.` });
        }
      }

      const deduplicated = deduplicateMentions(mentions);
      let persisted = false;
      let persistenceError: string | undefined;
      let runId = `run-${crypto.randomUUID()}`;
      try {
        // The function is the trusted write boundary: it derives ownership from
        // the verified JWT and never accepts a database owner ID from the client.
        const stored = await persistCollection(context.supabaseAdmin, userId, input.monitor, input.project, deduplicated, sourceResults, startedAt);
        runId = stored.runId;
        persisted = true;
      } catch (error) {
        persistenceError = errorMessage(error, "Database persistence failed.");
        console.error("Radar persistence failed", persistenceError);
      }

      return Response.json({
        runId,
        mentions: deduplicated,
        sourceResults,
        persisted,
        persistenceError,
        quota: {
          remainingMinute: quota.remainingMinute,
          remainingDay: quota.remainingDay,
        },
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      return Response.json({ error: errorMessage(error, "The connector request failed.") }, { status: 400 });
    }
  }),
};

interface RadarQuota {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingMinute: number;
  remainingDay: number;
}

async function consumeRadarQuota(
  supabase: { rpc: (name: string, parameters: Record<string, unknown>) => { single: () => Promise<{ data: unknown; error: unknown }> } },
  userId: string,
): Promise<RadarQuota> {
  const { data, error } = await supabase.rpc("consume_radar_quota", { target_user_id: userId }).single();
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("The Radar quota response was invalid.");

  const row = data as Record<string, unknown>;
  if (typeof row.allowed !== "boolean") throw new Error("The Radar quota response was incomplete.");
  return {
    allowed: row.allowed,
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds) || 0),
    remainingMinute: Math.max(0, Number(row.remaining_minute) || 0),
    remainingDay: Math.max(0, Number(row.remaining_day) || 0),
  };
}

async function consumeEvidenceExtractionQuota(
  supabase: { rpc: (name: string, parameters: Record<string, unknown>) => { single: () => Promise<{ data: unknown; error: unknown }> } },
  userId: string,
): Promise<RadarQuota> {
  const { data, error } = await supabase.rpc("consume_evidence_extraction_quota", { target_user_id: userId }).single();
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("The evidence extraction quota response was invalid.");
  const row = data as Record<string, unknown>;
  return {
    allowed: row.allowed === true,
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds) || 0),
    remainingMinute: Math.max(0, Number(row.remaining_minute) || 0),
    remainingDay: Math.max(0, Number(row.remaining_day) || 0),
  };
}

function authenticatedUserId(context: { authMode: string; userClaims: Record<string, unknown> }) {
  if (context.authMode !== "user") throw new Error("An authenticated user session is required.");
  const userId = String(context.userClaims.sub || context.userClaims.id || "");
  if (!userId) throw new Error("The authenticated user ID is unavailable.");
  return userId;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function validateRunRequest(value: unknown): RunRequest {
  if (!value || typeof value !== "object") throw new Error("A monitor request is required.");
  const candidate = value as Partial<RunRequest>;
  if (candidate.action !== "run" || !candidate.monitor || !candidate.connectorConfig) throw new Error("The monitor request is incomplete.");
  const allowed = new Set<ConnectorSource>(["rss", "manual", "youtube"]);
  const sources = [...new Set((candidate.monitor.sources ?? []).filter((source): source is ConnectorSource => allowed.has(source as ConnectorSource)))];
  if (!sources.length) throw new Error("No implemented source was selected.");
  if (!candidate.monitor.id || !candidate.monitor.name || !candidate.monitor.query || !candidate.monitor.builder) throw new Error("The monitor definition is incomplete.");
  if (candidate.monitor.query.length > 1_000) throw new Error("The monitoring query is too long.");
  return {
    action: "run",
    monitor: {
      ...candidate.monitor,
      id: String(candidate.monitor.id).slice(0, 160),
      name: String(candidate.monitor.name).slice(0, 200),
      query: String(candidate.monitor.query).slice(0, 1_000),
      language: String(candidate.monitor.language || "Any language").slice(0, 80),
      market: String(candidate.monitor.market || "").slice(0, 160),
      sources,
      builder: {
        includeAll: cleanTerms(candidate.monitor.builder.includeAll),
        includeAny: cleanTerms(candidate.monitor.builder.includeAny),
        exclude: cleanTerms(candidate.monitor.builder.exclude),
      },
    },
    project: cleanProject(candidate.project),
    connectorConfig: {
      rssFeedUrls: cleanUrls(candidate.connectorConfig.rssFeedUrls),
      manualUrls: cleanUrls(candidate.connectorConfig.manualUrls),
      youtubeEnabled: Boolean(candidate.connectorConfig.youtubeEnabled),
    },
  };
}

function isDeleteMonitorAction(value: unknown) {
  return Boolean(value && typeof value === "object" && "action" in value && value.action === "delete-monitor");
}

function isExtractUrlAction(value: unknown) {
  return Boolean(value && typeof value === "object" && "action" in value && value.action === "extract-url");
}

function validateExtractUrlRequest(value: unknown): ExtractUrlRequest {
  if (!value || typeof value !== "object") throw new Error("A link inspection request is required.");
  const candidate = value as Partial<ExtractUrlRequest>;
  const projectId = String(candidate.projectId || "").trim();
  const url = String(candidate.url || "").trim();
  if (candidate.action !== "extract-url" || !projectId || !url) throw new Error("The link inspection request is incomplete.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error("The project reference is invalid.");
  }
  if (url.length > 4_000) throw new Error("The source URL is too long.");
  return { action: "extract-url", projectId, url };
}

function validateDeleteMonitorRequest(value: unknown): DeleteMonitorRequest {
  if (!value || typeof value !== "object") throw new Error("A monitor deletion request is required.");
  const candidate = value as Partial<DeleteMonitorRequest>;
  const monitorId = String(candidate.monitorId || "").trim();
  if (candidate.action !== "delete-monitor" || !monitorId) throw new Error("The monitor deletion request is incomplete.");
  return {
    action: "delete-monitor",
    monitorId: monitorId.slice(0, 160),
    project: cleanProject(candidate.project),
  };
}

function cleanProject(project: ProjectInput | null | undefined): ProjectInput | null {
  if (!project) return null;
  const id = String(project.id || "").trim();
  const name = String(project.name || "").trim();
  if (!id || !name) throw new Error("The project definition is incomplete.");
  return {
    id: id.slice(0, 160),
    name: name.slice(0, 200),
    description: project.description ? String(project.description).slice(0, 2_000) : undefined,
    market: project.market ? String(project.market).slice(0, 160) : undefined,
  };
}

function cleanTerms(values: unknown) {
  return Array.isArray(values) ? values.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 25).map((value) => value.slice(0, 120)) : [];
}

function cleanUrls(values: unknown) {
  return Array.isArray(values) ? [...new Set(values.map(String).map((value) => value.trim()).filter(Boolean))].slice(0, 10) : [];
}

function deduplicateMentions(mentions: NormalizedMention[]) {
  const unique = new Map<string, NormalizedMention>();
  mentions.forEach((mention) => unique.set(`${mention.platform}:${mention.externalId}`, mention));
  return [...unique.values()];
}

async function findDuplicateEvidence(client: SupabaseClient, projectId: string, candidates: string[]) {
  const fingerprints = new Set(candidates.map(comparableUrl).filter(Boolean));
  if (!fingerprints.size) return null;

  const pageSize = 500;
  for (let page = 0; page < 20; page += 1) {
    const { data, error } = await client
      .from("research_items")
      .select("id,client_ref,title,url,metadata,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .range(page * pageSize, ((page + 1) * pageSize) - 1);
    if (error) throw new Error(`Duplicate evidence check failed: ${error.message || "Unknown database error."}`);
    const rows = Array.isArray(data) ? data as Record<string, unknown>[] : [];
    for (const row of rows) {
      const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {};
      const savedUrls = [row.url, metadata.original_url, metadata.final_url, metadata.canonical_url]
        .filter((value): value is string => typeof value === "string")
        .map(comparableUrl);
      if (savedUrls.some((url) => fingerprints.has(url))) {
        return {
          id: String(row.id || ""),
          clientRef: typeof row.client_ref === "string" ? row.client_ref : null,
          title: String(row.title || "Saved evidence"),
          url: typeof row.url === "string" ? row.url : null,
          createdAt: typeof row.created_at === "string" ? row.created_at : null,
        };
      }
    }
    if (rows.length < pageSize) break;
  }
  return null;
}
