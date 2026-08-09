import { sourceFromDatabase } from "./model.ts";
import type { RadarMonitorSummary, RadarObservedSource } from "./types.ts";

export interface RadarMonitorSummaryRow {
  monitor_id: string;
  scope_topic: string | null;
  range_start: string;
  range_end: string;
  current_mentions: number | string;
  previous_mentions: number | string;
  all_time_mentions: number | string;
  mention_growth: number | string;
  estimated_engagement: number | string;
  positive_percent: number | string;
  neutral_percent: number | string;
  negative_percent: number | string;
  unique_authors: number | string;
  active_sources: number | string;
  range_first_observed_at: string | null;
  range_last_observed_at: string | null;
  first_observed_at: string | null;
  last_observed_at: string | null;
  source_counts: unknown;
  last_run_at: string | null;
  last_successful_run_at: string | null;
  latest_run_status: string | null;
}

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function observedSources(value: unknown): RadarObservedSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = record(item);
    if (typeof source.source !== "string") return [];
    return [{
      source: sourceFromDatabase(source.source),
      label: typeof source.label === "string" && source.label ? source.label : source.source,
      records: count(source.records),
      engagement: count(source.engagement),
      firstObservedAt: optionalText(source.firstObservedAt),
      lastObservedAt: optionalText(source.lastObservedAt),
    }];
  });
}

export function radarMonitorSummaryFromRow(row: RadarMonitorSummaryRow): RadarMonitorSummary {
  return {
    monitorId: row.monitor_id,
    scopeTopic: optionalText(row.scope_topic),
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    previousMentions: count(row.previous_mentions),
    allTimeMentions: count(row.all_time_mentions),
    metrics: {
      totalMentions: count(row.current_mentions),
      mentionGrowth: count(row.mention_growth),
      engagement: count(row.estimated_engagement),
      positive: count(row.positive_percent),
      neutral: count(row.neutral_percent),
      negative: count(row.negative_percent),
      uniqueAuthors: count(row.unique_authors),
      activeSources: count(row.active_sources),
    },
    rangeFirstObservedAt: optionalText(row.range_first_observed_at),
    rangeLastObservedAt: optionalText(row.range_last_observed_at),
    firstObservedAt: optionalText(row.first_observed_at),
    lastObservedAt: optionalText(row.last_observed_at),
    sources: observedSources(row.source_counts),
    lastRunAt: optionalText(row.last_run_at),
    lastSuccessfulRunAt: optionalText(row.last_successful_run_at),
    latestRunStatus: optionalText(row.latest_run_status),
  };
}
