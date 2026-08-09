// Shared Radar collection orchestration. Manual and scheduled invocations both
// enter here so quotas, run leases, connector checkpoints, normalization, and
// persistence cannot drift into separate implementations.
// deno-lint-ignore-file no-explicit-any
import { advanceMonitorCursor, readMonitorCursor, sourceCursor } from "./cursor.ts";
import { beginCollectionRun, failCollectionRun, persistCollection, persistConnectorConfig } from "./database.ts";
import { deduplicateMentions } from "./deduplicate.ts";
import { createConnectorRegistry } from "./registry.ts";
import { runReliableOperation } from "./reliability.ts";
import type { NormalizedMention, RunRequest, SourceRunResult } from "./types.ts";

export type RadarRunTrigger = "manual" | "scheduled";

export interface RadarCollectionResult {
  runId: string;
  mentions: NormalizedMention[];
  sourceResults: SourceRunResult[];
  mentionsFetched: number;
  mentionsCreated: number;
  mentionsUpdated: number;
  duplicatesRemoved: number;
  durationMs: number;
  incremental: boolean;
  cursorAdvancedSources: string[];
  persisted: boolean;
  persistenceError?: string;
  quota: { remainingMinute: number; remainingDay: number };
  fetchedAt: string;
}

export class RadarCollectionRequestError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number;

  constructor(message: string, status: number, retryAfterSeconds = 0) {
    super(message);
    this.name = "RadarCollectionRequestError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function runRadarCollection(
  supabase: any,
  userId: string,
  input: RunRequest,
  triggerType: RadarRunTrigger,
): Promise<RadarCollectionResult> {
  let activeRunId = "";
  let quota: RadarQuota;
  try {
    quota = await consumeRadarQuota(supabase, userId);
  } catch (error) {
    console.error("Radar quota check failed", errorMessage(error, "Quota check failed."));
    throw new RadarCollectionRequestError("Radar is temporarily unavailable. Please try again shortly.", 503);
  }
  if (!quota.allowed) {
    throw new RadarCollectionRequestError(
      "Radar run limit reached. Please wait before running this monitor again.",
      429,
      quota.retryAfterSeconds,
    );
  }

  try {
    const startedAt = new Date().toISOString();
    const collectionRun = await beginCollectionRun(supabase, userId, input.monitor, input.project, startedAt, triggerType);
    activeRunId = collectionRun.runId;
    await persistConnectorConfig(supabase, collectionRun.projectId, input.connectorConfig);
    const checkpoint = readMonitorCursor(collectionRun.previousCursor, input.monitor);
    const registry = createConnectorRegistry(input, { youtubeApiKey: Deno.env.get("YOUTUBE_API_KEY") || "" });
    const collectionStartedAt = Date.now();
    const collectionResults = await Promise.all(input.monitor.sources.map(async (source) => {
      const connector = registry.get(source);
      if (!connector) {
        return {
          mentions: [] as NormalizedMention[],
          cursor: undefined,
          result: { source, status: "failed", count: 0, message: "This connector is not implemented.", attempts: 0, durationMs: 0 } satisfies SourceRunResult,
        };
      }
      const outcome = await runReliableOperation((signal) => connector.collect(signal, sourceCursor(checkpoint.cursor, source)));
      if (!outcome.ok || !outcome.value) {
        return {
          mentions: [] as NormalizedMention[],
          cursor: undefined,
          result: {
            source,
            status: "failed",
            count: 0,
            message: outcome.timedOut ? "Collection timed out before this source completed." : outcome.error || `${source} retrieval failed.`,
            attempts: outcome.attempts,
            durationMs: outcome.durationMs,
            timedOut: outcome.timedOut,
          } satisfies SourceRunResult,
        };
      }
      return {
        mentions: outcome.value.mentions,
        cursor: outcome.value.cursor,
        result: {
          ...outcome.value.result,
          attempts: outcome.attempts,
          durationMs: outcome.durationMs,
          timedOut: false,
        } satisfies SourceRunResult,
      };
    }));

    const mentions = collectionResults.flatMap((result) => result.mentions);
    const deduplication = deduplicateMentions(mentions);
    const advancedCheckpoint = advanceMonitorCursor(checkpoint.cursor, collectionResults.map(({ result, cursor }) => ({
      source: result.source,
      status: result.status,
      cursor,
    })));
    const sourceResults = collectionResults.map(({ result }) => ({
      ...result,
      duplicatesRemoved: deduplication.duplicatesBySource[result.source] ?? 0,
      cursorAdvanced: advancedCheckpoint.advancedSources.includes(result.source),
    }));
    const diagnostics = {
      mentionsFetched: mentions.length,
      duplicatesRemoved: deduplication.duplicatesRemoved,
      durationMs: Date.now() - collectionStartedAt,
      quota: {
        remainingMinute: quota.remainingMinute,
        remainingDay: quota.remainingDay,
      },
    };
    let persisted = false;
    let persistenceError: string | undefined;
    let mentionsCreated = deduplication.mentions.length;
    let mentionsUpdated = 0;
    try {
      const stored = await persistCollection(
        supabase,
        collectionRun,
        deduplication.mentions,
        sourceResults,
        diagnostics,
        advancedCheckpoint.cursor,
        advancedCheckpoint.advancedSources,
        checkpoint.incremental,
      );
      mentionsCreated = stored.mentionsCreated;
      mentionsUpdated = stored.mentionsUpdated;
      persisted = true;
    } catch (error) {
      persistenceError = errorMessage(error, "Database persistence failed.");
      console.error("Radar persistence failed", persistenceError);
      await failCollectionRun(supabase, collectionRun.runId, persistenceError);
    }

    return {
      runId: collectionRun.runId,
      mentions: deduplication.mentions,
      sourceResults,
      mentionsFetched: diagnostics.mentionsFetched,
      mentionsCreated,
      mentionsUpdated,
      duplicatesRemoved: diagnostics.duplicatesRemoved,
      durationMs: diagnostics.durationMs,
      incremental: checkpoint.incremental,
      cursorAdvancedSources: advancedCheckpoint.advancedSources,
      persisted,
      persistenceError,
      quota: diagnostics.quota,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (activeRunId) await failCollectionRun(supabase, activeRunId, errorMessage(error, "The connector request failed."));
    throw error;
  }
}

interface RadarQuota {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingMinute: number;
  remainingDay: number;
}

async function consumeRadarQuota(supabase: any, userId: string): Promise<RadarQuota> {
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

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}
