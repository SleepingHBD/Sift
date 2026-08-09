import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateMentions } from "../supabase/functions/_shared/deduplicate.ts";
import { advanceMonitorCursor, readMonitorCursor, sourceCursor } from "../supabase/functions/_shared/cursor.ts";
import { isRetryableConnectorError, runReliableOperation } from "../supabase/functions/_shared/reliability.ts";
import { monitorRuns, runDuration, runHealthStatus, sourceHealthForRuns } from "../lib/radar/run-diagnostics.ts";

function mention(platform, externalId) {
  return {
    id: `${platform}-${externalId}`,
    platform,
    externalId,
    content: "A collected conversation",
    publishedAt: "2026-08-09T00:00:00.000Z",
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    engagement: 0,
    metadata: {},
  };
}

function run(overrides = {}) {
  return {
    id: "run-one",
    monitorId: "monitor-one",
    connectorIds: ["rss", "youtube"],
    status: "completed",
    startedAt: "2026-08-09T00:00:00.000Z",
    completedAt: "2026-08-09T00:00:03.000Z",
    mentionsFetched: 5,
    mentionsCreated: 3,
    persisted: true,
    sourceResults: [
      { source: "rss", status: "completed", count: 3 },
      { source: "youtube", status: "failed", count: 0, message: "Timed out", timedOut: true },
    ],
    ...overrides,
  };
}

test("deduplication exposes removed records by source", () => {
  const result = deduplicateMentions([
    mention("rss", "one"),
    { ...mention("rss", "one"), content: "Updated content" },
    mention("youtube", "one"),
  ]);
  assert.equal(result.mentions.length, 2);
  assert.equal(result.mentions[0].content, "Updated content");
  assert.equal(result.duplicatesRemoved, 1);
  assert.deepEqual(result.duplicatesBySource, { rss: 1 });
});

test("reliability retries transient failures but not configuration errors", async () => {
  let attempts = 0;
  const recovered = await runReliableOperation(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("The source returned HTTP 503.");
    return "collected";
  }, { retryDelayMs: 1 });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.value, "collected");
  assert.equal(recovered.attempts, 2);

  const rejected = await runReliableOperation(async () => {
    throw new Error("Add at least one public URL.");
  }, { retryDelayMs: 1 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.attempts, 1);
  assert.equal(isRetryableConnectorError(new Error("HTTP 429")), true);
});

test("reliability records source timeouts", async () => {
  const result = await runReliableOperation((signal) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }), { timeoutMs: 5, maxAttempts: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.attempts, 1);
});

test("run diagnostics distinguish partial success and retain last source success", () => {
  const latest = run();
  const older = run({
    id: "run-older",
    startedAt: "2026-08-08T00:00:00.000Z",
    completedAt: "2026-08-08T00:00:04.000Z",
    sourceResults: [
      { source: "rss", status: "completed", count: 2 },
      { source: "youtube", status: "completed", count: 4 },
    ],
  });
  const history = monitorRuns([older, latest, run({ id: "other", monitorId: "monitor-two" })], "monitor-one");
  assert.deepEqual(history.map((item) => item.id), ["run-one", "run-older"]);
  assert.equal(runHealthStatus(latest), "partial");
  assert.equal(runDuration(latest), 3_000);
  const health = sourceHealthForRuns(history, ["rss", "youtube"]);
  assert.equal(health.find((item) => item.source === "youtube")?.latestResult?.status, "failed");
  assert.equal(health.find((item) => item.source === "youtube")?.lastSuccessfulAt, older.completedAt);
});

test("running collection health is not mistaken for a failed empty result", () => {
  assert.equal(runHealthStatus(run({ status: "running", completedAt: undefined, sourceResults: [] })), "running");
});

test("connector checkpoints resume only when the monitor definition still matches", () => {
  const monitor = {
    id: "monitor-one",
    name: "Category",
    query: "category",
    builder: { includeAll: ["category"], includeAny: [], exclude: [] },
    language: "Any language",
    market: "",
    sources: ["rss", "youtube"],
  };
  const initial = readMonitorCursor(null, monitor);
  const advanced = advanceMonitorCursor(initial.cursor, [
    { source: "rss", status: "completed", cursor: { seenExternalIds: { feed: ["item-one"] } } },
    { source: "youtube", status: "failed", cursor: { recentExternalIds: ["video-one"] } },
  ], "2026-08-09T01:00:00.000Z");
  assert.deepEqual(advanced.advancedSources, ["rss"]);
  assert.deepEqual(sourceCursor(advanced.cursor, "rss"), { seenExternalIds: { feed: ["item-one"] } });
  assert.equal(sourceCursor(advanced.cursor, "youtube"), undefined);

  const resumed = readMonitorCursor(advanced.cursor, monitor);
  assert.equal(resumed.incremental, true);
  assert.deepEqual(sourceCursor(resumed.cursor, "rss"), { seenExternalIds: { feed: ["item-one"] } });

  const changedQuery = readMonitorCursor(advanced.cursor, { ...monitor, query: "different", builder: { ...monitor.builder, includeAll: ["different"] } });
  assert.equal(changedQuery.incremental, false);
  assert.equal(sourceCursor(changedQuery.cursor, "rss"), undefined);
});
