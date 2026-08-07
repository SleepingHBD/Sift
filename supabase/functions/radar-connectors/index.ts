import { withSupabase } from "npm:@supabase/server@1.4.1";
import { persistCollection } from "../_shared/database.ts";
import { createConnectorRegistry } from "../_shared/registry.ts";
import type { ConnectorSource, NormalizedMention, RunRequest, SourceRunResult } from "../_shared/types.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    try {
      const input = validateRunRequest(await request.json());
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
        if (context.authMode !== "user") throw new Error("An authenticated user session is required for persistence.");
        const userId = String(context.userClaims.sub || context.userClaims.id || "");
        if (!userId) throw new Error("The authenticated user ID is unavailable.");
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
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      return Response.json({ error: errorMessage(error, "The connector request failed.") }, { status: 400 });
    }
  }),
};

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
    project: candidate.project ? { id: String(candidate.project.id).slice(0, 160), name: String(candidate.project.name).slice(0, 200), description: candidate.project.description ? String(candidate.project.description).slice(0, 2_000) : undefined, market: candidate.project.market ? String(candidate.project.market).slice(0, 160) : undefined } : null,
    connectorConfig: {
      rssFeedUrls: cleanUrls(candidate.connectorConfig.rssFeedUrls),
      manualUrls: cleanUrls(candidate.connectorConfig.manualUrls),
      youtubeEnabled: Boolean(candidate.connectorConfig.youtubeEnabled),
    },
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
