import assert from "node:assert/strict";
import test from "node:test";
import { radarMonitorSummaryFromRow } from "../lib/radar/summary.ts";

test("maps a database Radar summary into precise UI metrics and coverage", () => {
  const summary = radarMonitorSummaryFromRow({
    monitor_id: "monitor-1",
    scope_topic: "Pricing",
    range_start: "2026-08-01T00:00:00Z",
    range_end: "2026-08-08T00:00:00Z",
    current_mentions: 24,
    previous_mentions: 12,
    all_time_mentions: 90,
    mention_growth: 100,
    estimated_engagement: "425.5",
    positive_percent: 25,
    neutral_percent: 50,
    negative_percent: 25,
    unique_authors: 19,
    active_sources: 2,
    range_first_observed_at: "2026-08-02T00:00:00Z",
    range_last_observed_at: "2026-08-07T00:00:00Z",
    first_observed_at: "2026-05-01T00:00:00Z",
    last_observed_at: "2026-08-07T00:00:00Z",
    source_counts: [
      { source: "youtube", label: "YouTube", records: 20, engagement: 400 },
      { source: "manual_url", label: "Manual URL", records: 4, engagement: 25.5 },
    ],
    last_run_at: "2026-08-07T01:00:00Z",
    last_successful_run_at: "2026-08-07T01:00:00Z",
    latest_run_status: "completed",
  });

  assert.deepEqual(summary.metrics, {
    totalMentions: 24,
    mentionGrowth: 100,
    engagement: 425.5,
    positive: 25,
    neutral: 50,
    negative: 25,
    uniqueAuthors: 19,
    activeSources: 2,
  });
  assert.equal(summary.scopeTopic, "Pricing");
  assert.equal(summary.previousMentions, 12);
  assert.equal(summary.allTimeMentions, 90);
  assert.deepEqual(summary.sources.map((source) => source.source), ["youtube", "manual"]);
});

test("uses safe empty defaults for missing optional coverage", () => {
  const summary = radarMonitorSummaryFromRow({
    monitor_id: "monitor-2",
    scope_topic: null,
    range_start: "2026-08-01T00:00:00Z",
    range_end: "2026-08-08T00:00:00Z",
    current_mentions: "0",
    previous_mentions: "0",
    all_time_mentions: "0",
    mention_growth: "0",
    estimated_engagement: "0",
    positive_percent: "0",
    neutral_percent: "0",
    negative_percent: "0",
    unique_authors: "0",
    active_sources: "0",
    range_first_observed_at: null,
    range_last_observed_at: null,
    first_observed_at: null,
    last_observed_at: null,
    source_counts: null,
    last_run_at: null,
    last_successful_run_at: null,
    latest_run_status: null,
  });

  assert.equal(summary.metrics.totalMentions, 0);
  assert.equal(summary.scopeTopic, undefined);
  assert.deepEqual(summary.sources, []);
  assert.equal(summary.lastSuccessfulRunAt, undefined);
});
