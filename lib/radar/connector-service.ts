import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { NormalizedMention } from "@/lib/connectors/types";
import { getRunnableSources, type RadarConnectorSettings } from "@/lib/radar/connector-utils";
import type { MonitoringQuery, RadarSource } from "@/lib/radar/types";

export { defaultRadarConnectorSettings, enrichConnectorMentions, getRunnableSources, mergeRadarMentions } from "@/lib/radar/connector-utils";
export type { RadarConnectorSettings } from "@/lib/radar/connector-utils";

export interface RadarRunSourceResult {
  source: RadarSource;
  status: "completed" | "failed";
  count: number;
  message?: string;
}

export interface RadarConnectorRunResult {
  runId: string;
  mentions: NormalizedMention[];
  sourceResults: RadarRunSourceResult[];
  persisted: boolean;
  persistenceError?: string;
  fetchedAt: string;
}

export interface RadarMonitorDeleteResult {
  deleted: boolean;
  mentionsDeleted: number;
}

type RadarProjectReference = { id: string; name: string; description?: string; market?: string };

export function isRadarConnectorBackendConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function runRadarConnectors(
  monitor: MonitoringQuery,
  settings: RadarConnectorSettings,
  project?: RadarProjectReference,
): Promise<RadarConnectorRunResult> {
  const sources = getRunnableSources(monitor, settings);
  if (!sources.length) throw new Error("Configure at least one source for this monitor.");
  const { client, accessToken } = await authenticatedRadarClient();

  const functionName = process.env.NEXT_PUBLIC_RADAR_FUNCTION_NAME || "radar-connectors";
  const { data, error } = await client.functions.invoke(functionName, {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      action: "run",
      monitor: {
        id: monitor.id,
        name: monitor.name,
        query: monitor.query,
        builder: monitor.builder,
        language: monitor.language,
        market: monitor.market,
        sources,
      },
      project: project ?? null,
      connectorConfig: {
        rssFeedUrls: sources.includes("rss") ? settings.rssFeedUrls : [],
        manualUrls: sources.includes("manual") ? settings.manualUrls : [],
        youtubeEnabled: sources.includes("youtube") && settings.youtubeEnabled,
      },
    },
  });

  if (error) throw new Error(await readFunctionError(error));
  if (!isRunResponse(data)) throw new Error("The connector service returned an invalid response.");
  return data;
}

export async function deleteRadarMonitor(
  monitorId: string,
  project?: RadarProjectReference,
): Promise<RadarMonitorDeleteResult> {
  const { client, accessToken } = await authenticatedRadarClient();
  const functionName = process.env.NEXT_PUBLIC_RADAR_FUNCTION_NAME || "radar-connectors";
  const { data, error } = await client.functions.invoke(functionName, {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { action: "delete-monitor", monitorId, project: project ?? null },
  });

  if (error) {
    const message = await readFunctionError(error);
    if (message.toLowerCase().includes("monitor request is incomplete")) {
      return deleteRadarMonitorWithRls(client, monitorId);
    }
    throw new Error(message);
  }
  if (!isDeleteResponse(data)) throw new Error("The connector service returned an invalid deletion response.");
  return data;
}

async function deleteRadarMonitorWithRls(
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>,
  monitorId: string,
): Promise<RadarMonitorDeleteResult> {
  // This fallback supports installations whose deployed connector function
  // predates monitor deletion. Every query remains constrained by project RLS.
  const { data: queryRows, error: queryError } = await client
    .from("monitoring_queries")
    .select("id,project_id")
    .eq("client_ref", monitorId)
    .limit(2);
  if (queryError) throw new Error(`Monitor lookup failed: ${queryError.message}`);
  if (!queryRows?.length) return { deleted: false, mentionsDeleted: 0 };
  if (queryRows.length > 1) throw new Error("More than one accessible cloud monitor matched this record.");

  const query = queryRows[0] as { id: string; project_id: string };
  const { data: mentionRows, error: mentionError } = await client
    .from("mentions")
    .select("id")
    .eq("project_id", query.project_id)
    .eq("monitoring_query_id", query.id);
  if (mentionError) throw new Error(`Monitor mention lookup failed: ${mentionError.message}`);
  const mentionIds = ((mentionRows ?? []) as { id: string }[]).map((mention) => String(mention.id));

  if (mentionIds.length) {
    const referenceDeletes = [
      client.from("saved_items").delete().eq("project_id", query.project_id).eq("item_type", "mention").in("item_id", mentionIds),
      client.from("item_tags").delete().eq("project_id", query.project_id).eq("item_type", "mention").in("item_id", mentionIds),
      client.from("insight_sources").delete().eq("source_type", "mention").in("source_id", mentionIds),
      client.from("brief_sources").delete().eq("source_type", "mention").in("source_id", mentionIds),
    ];
    for (const deletion of referenceDeletes) {
      const { error } = await deletion;
      if (error) throw new Error(`Monitor reference cleanup failed: ${error.message}`);
    }

    const { error: deleteMentionsError } = await client
      .from("mentions")
      .delete()
      .eq("project_id", query.project_id)
      .in("id", mentionIds);
    if (deleteMentionsError) throw new Error(`Monitor mention deletion failed: ${deleteMentionsError.message}`);
  }

  const { data: deletedQueries, error: deleteQueryError } = await client
    .from("monitoring_queries")
    .delete()
    .eq("id", query.id)
    .eq("project_id", query.project_id)
    .select("id");
  if (deleteQueryError) throw new Error(`Monitor deletion failed: ${deleteQueryError.message}`);
  if (!deletedQueries?.length) throw new Error("Monitor deletion was not permitted for the current user.");
  return { deleted: true, mentionsDeleted: mentionIds.length };
}

async function authenticatedRadarClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Add your Supabase URL and publishable key before managing a cloud monitor.");

  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Sign in with GitHub before managing a cloud monitor.");
  client.functions.setAuth(accessToken);
  return { client, accessToken };
}

async function readFunctionError(error: { message: string; context?: unknown }) {
  const response = error.context;
  if (response instanceof Response) {
    try {
      const body = await response.json() as { error?: string };
      if (body.error) return body.error;
    } catch {
      // Fall back to the SDK message when the body is not JSON.
    }
  }
  return error.message;
}

function isRunResponse(value: unknown): value is RadarConnectorRunResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RadarConnectorRunResult>;
  return typeof candidate.runId === "string"
    && Array.isArray(candidate.mentions)
    && Array.isArray(candidate.sourceResults)
    && typeof candidate.persisted === "boolean"
    && typeof candidate.fetchedAt === "string";
}

function isDeleteResponse(value: unknown): value is RadarMonitorDeleteResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RadarMonitorDeleteResult>;
  return typeof candidate.deleted === "boolean" && typeof candidate.mentionsDeleted === "number";
}
