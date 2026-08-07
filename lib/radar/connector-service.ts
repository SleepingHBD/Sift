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

export function isRadarConnectorBackendConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function runRadarConnectors(
  monitor: MonitoringQuery,
  settings: RadarConnectorSettings,
  project?: { id: string; name: string; description?: string; market?: string },
): Promise<RadarConnectorRunResult> {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Add your Supabase URL and publishable key before running a monitor.");

  const sources = getRunnableSources(monitor, settings);
  if (!sources.length) throw new Error("Configure at least one source for this monitor.");

  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) {
    const { error: signInError } = await client.auth.signInAnonymously();
    if (signInError) throw new Error(`Supabase sign-in failed: ${signInError.message}. Enable Anonymous Sign-Ins for this project.`);
  }

  const functionName = process.env.NEXT_PUBLIC_RADAR_FUNCTION_NAME || "radar-connectors";
  const { data, error } = await client.functions.invoke(functionName, {
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
