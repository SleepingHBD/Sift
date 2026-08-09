import assert from "node:assert/strict";
import test from "node:test";
import { createMonitorClientRef, monitorRunFromRow, monitoringQueryFromRow, radarMentionFromRow, shouldPersistMonitorRun } from "../lib/radar/model.ts";

const monitorRow = {
  id: "cloud-monitor",
  client_ref: "monitor-local",
  project_id: "cloud-project",
  brand_id: null,
  name: "Category conversation",
  query: '"category" AND "Singapore"',
  description: "Track a live question.",
  parsed_query: { includeAll: ["category", "Singapore"], includeAny: [], exclude: ["jobs"] },
  enabled: true,
  schedule_frequency: "weekly",
  schedule_hour: 8,
  schedule_weekday: 2,
  schedule_timezone: "Asia/Singapore",
  schedule_enabled: false,
  next_scheduled_run_at: null,
  last_scheduled_run_at: null,
  schedule_failure_count: 0,
  last_schedule_error: null,
  retention_days: 180,
  retention_enabled: true,
  last_retention_run_at: "2026-08-08T02:00:00.000Z",
  last_retention_deleted_count: 3,
  last_retention_error: null,
  platform_filters: ["youtube", "manual_url"],
  language: null,
  market: "Singapore",
  keywords: [],
  excluded_keywords: ["jobs"],
  created_at: "2026-08-08T00:00:00.000Z",
  last_run_at: "2026-08-08T01:00:00.000Z",
};

test("cloud monitors retain their stable browser identity and normalized sources", () => {
  const monitor = monitoringQueryFromRow(monitorRow, "project-local", "Category brand", ["Category competitor"], 4);
  assert.equal(monitor.id, "monitor-local");
  assert.equal(monitor.cloudId, "cloud-monitor");
  assert.equal(monitor.projectId, "project-local");
  assert.deepEqual(monitor.sources, ["youtube", "manual"]);
  assert.equal(monitor.dataMode, "live");
  assert.deepEqual(monitor.builder.exclude, ["jobs"]);
  assert.equal(monitor.scheduleFrequency, "weekly");
  assert.equal(monitor.scheduleHour, 8);
  assert.equal(monitor.scheduleTimezone, "Asia/Singapore");
  assert.equal(monitor.scheduleEnabled, false);
  assert.equal(monitor.scheduleFailureCount, 0);
  assert.equal(monitor.retentionDays, 180);
  assert.equal(monitor.retentionEnabled, true);
  assert.equal(monitor.lastRetentionDeletedCount, 3);
});

test("personal Radar remains internal instead of appearing as a user project", () => {
  const monitor = monitoringQueryFromRow({ ...monitorRow, client_ref: null }, "personal-radar");
  assert.equal(monitor.id, "cloud-monitor");
  assert.equal(monitor.projectId, "");
  assert.equal(monitor.dataMode, "empty");
});

test("unknown schedule and retention values fall back to non-destructive defaults", () => {
  const monitor = monitoringQueryFromRow({
    ...monitorRow,
    schedule_frequency: "hourly",
    schedule_hour: 99,
    schedule_weekday: -1,
    schedule_timezone: "",
    retention_days: 30,
    retention_enabled: false,
  }, "project-local");
  assert.equal(monitor.scheduleFrequency, "manual");
  assert.equal(monitor.scheduleHour, 9);
  assert.equal(monitor.scheduleWeekday, 1);
  assert.equal(monitor.scheduleTimezone, "UTC");
  assert.equal(monitor.retentionDays, null);
  assert.equal(monitor.retentionEnabled, false);
});

test("cloud conversations keep a stable UI evidence ID and inspectable topics", () => {
  const monitor = monitoringQueryFromRow(monitorRow, "project-local");
  const mention = radarMentionFromRow({
    id: "cloud-mention",
    project_id: "cloud-project",
    monitoring_query_id: "cloud-monitor",
    platform: "manual_url",
    external_id: "article-1",
    author: "Research desk",
    content: "A category community is forming in Singapore.",
    url: "https://example.com/article",
    published_at: "2026-08-08T00:30:00.000Z",
    likes: 1,
    comments: 2,
    shares: 3,
    views: 40,
    engagement: 14,
    language: "en",
    sentiment: "positive",
    sentiment_score: 0.4,
    keywords: ["category", "community"],
    metadata: { authorHandle: "desk" },
    is_important: false,
    created_at: "2026-08-08T00:31:00.000Z",
    sources: { name: "Manual URL imports" },
    mention_topics: [{ topics: { name: "Community" } }],
  }, monitor);
  assert.equal(mention.id, "monitor-local:manual:article-1");
  assert.equal(mention.cloudId, "cloud-mention");
  assert.equal(mention.sourceLabel, "Manual URL imports");
  assert.deepEqual(mention.topics, ["Community"]);
});

test("cloud run metadata returns source diagnostics", () => {
  const run = monitorRunFromRow({
    id: "cloud-run",
    client_ref: "run-local",
    monitoring_query_id: "cloud-monitor",
    status: "completed",
    started_at: "2026-08-08T00:00:00.000Z",
    completed_at: "2026-08-08T00:01:00.000Z",
    mentions_fetched: 4,
    mentions_created: 4,
    mentions_updated: 0,
    error_message: null,
    run_metadata: {
      sourceResults: [{ source: "youtube", status: "completed", count: 4, collectionMode: "incremental", cursorAdvanced: true }],
      incremental: true,
      cursorAdvancedSources: ["youtube"],
      triggerType: "manual",
    },
  }, "monitor-local");
  assert.equal(run.id, "run-local");
  assert.equal(run.persisted, true);
  assert.deepEqual(run.connectorIds, ["youtube"]);
  assert.equal(run.incremental, true);
  assert.deepEqual(run.cursorAdvancedSources, ["youtube"]);
  assert.equal(run.sourceResults[0].collectionMode, "incremental");
});

test("new Radar monitors use UUID-backed client references", () => {
  assert.equal(createMonitorClientRef(() => "fixed-uuid"), "monitor-fixed-uuid");
});

test("browser migration does not reinsert runs that already persisted to the cloud", () => {
  assert.equal(shouldPersistMonitorRun({ persisted: true }), false);
  assert.equal(shouldPersistMonitorRun({ persisted: false, cloudId: "cloud-run" }), false);
  assert.equal(shouldPersistMonitorRun({ persisted: false }), true);
});
