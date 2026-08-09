import { withSupabase } from "npm:@supabase/server@1.4.1";
import { RadarCollectionRequestError, runRadarCollection } from "../_shared/collection.ts";
import { MonitorRunConflictError } from "../_shared/database.ts";
import type { ConnectorConfigInput, ConnectorSource, ProjectInput, QueryBuilderInput, RunRequest } from "../_shared/types.ts";

export default {
  // The platform gateway still verifies a Supabase JWT. pg_cron supplies the
  // project's legacy publishable JWT, while the database claim RPC verifies a
  // second high-entropy token stored only in Vault.
  fetch: withSupabase({ auth: "none" }, async (request, context) => {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
    const schedulerToken = request.headers.get("x-sift-scheduler-token") || "";
    if (schedulerToken.length < 32) return Response.json({ error: "The scheduler credential is missing." }, { status: 401 });

    try {
      const body = await request.json() as { action?: unknown };
      if (body.action !== "dispatch") return Response.json({ error: "The scheduler request is invalid." }, { status: 400 });

      const { data, error } = await context.supabaseAdmin.rpc("claim_due_radar_monitors", {
        p_scheduler_token: schedulerToken,
        p_limit: 2,
      });
      if (error) throw new SchedulerAuthorizationError(error.message || "Scheduled monitors could not be claimed.");
      const claims = Array.isArray(data) ? data as ScheduledMonitorClaim[] : [];
      const results = await Promise.all(claims.map((claim) => processClaim(context.supabaseAdmin, schedulerToken, claim)));
      return Response.json({ claimed: claims.length, results, dispatchedAt: new Date().toISOString() });
    } catch (error) {
      const message = errorMessage(error, "The Radar scheduler could not dispatch due monitors.");
      return Response.json({ error: message }, { status: error instanceof SchedulerAuthorizationError ? 403 : 500 });
    }
  }),
};

interface ScheduledMonitorClaim {
  monitor_id: string;
  claim_token: string;
  user_id: string;
  project: unknown;
  monitor: unknown;
  connector_config: unknown;
}

class SchedulerAuthorizationError extends Error {}

async function processClaim(
  supabase: any,
  schedulerToken: string,
  claim: ScheduledMonitorClaim,
) {
  let succeeded = false;
  let failure = "";
  let retryAfterSeconds = 900;
  let runId: string | undefined;
  try {
    const input = scheduledRunRequest(claim);
    const result = await runRadarCollection(supabase, requiredString(claim.user_id, "The scheduled monitor owner is unavailable."), input, "scheduled");
    runId = result.runId;
    succeeded = result.persisted && result.sourceResults.some((source) => source.status === "completed");
    if (!succeeded) {
      failure = result.persistenceError
        || result.sourceResults.map((source) => source.message).filter(Boolean).join(" ")
        || "Every configured source failed during scheduled collection.";
    }
  } catch (error) {
    failure = errorMessage(error, "The scheduled collection failed.");
    if (error instanceof RadarCollectionRequestError && error.retryAfterSeconds) retryAfterSeconds = error.retryAfterSeconds;
    if (error instanceof MonitorRunConflictError) retryAfterSeconds = 300;
  }

  const { error: finalizeError } = await supabase.rpc("finalize_radar_schedule_claim", {
    p_scheduler_token: schedulerToken,
    p_monitor_id: requiredString(claim.monitor_id, "The scheduled monitor ID is unavailable."),
    p_claim_token: requiredString(claim.claim_token, "The scheduled monitor claim is unavailable."),
    p_succeeded: succeeded,
    p_error: succeeded ? null : failure,
    p_retry_after_seconds: retryAfterSeconds,
  });
  if (finalizeError) {
    console.error("Radar schedule claim could not be finalized", finalizeError.message || finalizeError);
    return { monitorId: claim.monitor_id, succeeded: false, runId, error: "The schedule claim could not be finalized." };
  }
  const retention = succeeded
    ? await runScheduledRetention(supabase, requiredString(claim.monitor_id, "The scheduled monitor ID is unavailable."))
    : undefined;
  return { monitorId: claim.monitor_id, succeeded, runId, retention, error: succeeded ? undefined : failure };
}

interface ScheduledRetentionResult {
  retention_run_id?: string | null;
  retention_status: "completed" | "failed" | "disabled";
  deleted_mentions?: number;
  remaining_eligible_mentions?: number;
  retention_error?: string | null;
}

async function runScheduledRetention(supabase: any, monitorId: string): Promise<ScheduledRetentionResult> {
  const { data, error } = await supabase.rpc("enforce_radar_retention", {
    p_monitor_id: monitorId,
    p_batch_limit: 250,
  });
  if (error) {
    console.error("Radar retention could not be audited", error.message || error);
    return { retention_status: "failed", retention_error: "The retention audit could not be completed." };
  }
  const result = Array.isArray(data) ? data[0] as ScheduledRetentionResult | undefined : undefined;
  return result ?? { retention_status: "failed", retention_error: "The retention audit returned no result." };
}

function scheduledRunRequest(claim: ScheduledMonitorClaim): RunRequest {
  const rawMonitor = record(claim.monitor);
  const rawProject = record(claim.project);
  const rawConfig = record(claim.connector_config);
  const connectorConfig: ConnectorConfigInput = {
    rssFeedUrls: cleanUrls(rawConfig.rssFeedUrls),
    manualUrls: cleanUrls(rawConfig.manualUrls),
    youtubeEnabled: rawConfig.youtubeEnabled === true,
  };
  const configuredSources: ConnectorSource[] = [];
  if (connectorConfig.rssFeedUrls.length) configuredSources.push("rss");
  if (connectorConfig.manualUrls.length) configuredSources.push("manual");
  if (connectorConfig.youtubeEnabled) configuredSources.push("youtube");
  const requestedSources = cleanSources(rawMonitor.sources);
  const sources = requestedSources.length
    ? configuredSources.filter((source) => requestedSources.includes(source))
    : configuredSources;
  if (!sources.length) throw new Error("No configured source is available for this scheduled monitor.");

  const builder = cleanBuilder(rawMonitor.builder);
  const project: ProjectInput = {
    id: requiredString(rawProject.id, "The scheduled project reference is unavailable.").slice(0, 160),
    name: requiredString(rawProject.name, "The scheduled project name is unavailable.").slice(0, 200),
    description: optionalString(rawProject.description)?.slice(0, 2_000),
    market: optionalString(rawProject.market)?.slice(0, 160),
  };
  return {
    action: "run",
    monitor: {
      id: requiredString(rawMonitor.id, "The scheduled monitor reference is unavailable.").slice(0, 160),
      name: requiredString(rawMonitor.name, "The scheduled monitor name is unavailable.").slice(0, 200),
      query: requiredString(rawMonitor.query, "The scheduled monitor query is unavailable.").slice(0, 1_000),
      builder,
      language: optionalString(rawMonitor.language)?.slice(0, 80) || "Any language",
      market: optionalString(rawMonitor.market)?.slice(0, 160) || "",
      sources,
    },
    project,
    connectorConfig: {
      rssFeedUrls: sources.includes("rss") ? connectorConfig.rssFeedUrls : [],
      manualUrls: sources.includes("manual") ? connectorConfig.manualUrls : [],
      youtubeEnabled: sources.includes("youtube") && connectorConfig.youtubeEnabled,
    },
  };
}

function cleanBuilder(value: unknown): QueryBuilderInput {
  const candidate = record(value);
  return {
    includeAll: cleanTerms(candidate.includeAll),
    includeAny: cleanTerms(candidate.includeAny),
    exclude: cleanTerms(candidate.exclude),
  };
}

function cleanSources(value: unknown): ConnectorSource[] {
  if (!Array.isArray(value)) return [];
  const mapped = value.map(String).map((source) => source === "manual_url" || source === "manual_note" ? "manual" : source);
  return [...new Set(mapped.filter((source): source is ConnectorSource => source === "rss" || source === "manual" || source === "youtube"))];
}

function cleanTerms(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).map((term) => term.trim()).filter(Boolean).slice(0, 25).map((term) => term.slice(0, 120))
    : [];
}

function cleanUrls(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(String).map((url) => url.trim()).filter((url) => /^https?:\/\//i.test(url)))].slice(0, 10)
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredString(value: unknown, message: string) {
  const resolved = typeof value === "string" ? value.trim() : "";
  if (!resolved) throw new Error(message);
  return resolved;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}
