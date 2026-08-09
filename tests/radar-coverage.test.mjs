import assert from "node:assert/strict";
import test from "node:test";
import { buildMonitorCoverage } from "../lib/radar/coverage.ts";

const configured = {
  rssFeedUrls: ["https://example.com/feed.xml"],
  manualUrls: ["https://example.com/article"],
  youtubeEnabled: true,
};

test("coverage uses every configured permitted source when no source restriction exists", () => {
  const coverage = buildMonitorCoverage([], configured, true);

  assert.equal(coverage.explicitSelection, false);
  assert.equal(coverage.runnableCount, 3);
  assert.deepEqual(coverage.sources.filter((source) => source.runnable).map((source) => source.source), ["youtube", "rss", "manual"]);
});

test("coverage honours explicit source selection", () => {
  const coverage = buildMonitorCoverage(["rss"], configured, true);

  assert.equal(coverage.runnableCount, 1);
  assert.equal(coverage.sources.find((source) => source.source === "rss")?.status, "ready");
  assert.equal(coverage.sources.find((source) => source.source === "youtube")?.status, "not-included");
});

test("coverage distinguishes missing configuration and backend setup", () => {
  const missing = buildMonitorCoverage(["rss"], { ...configured, rssFeedUrls: [] }, true);
  const automatic = buildMonitorCoverage([], { rssFeedUrls: [], manualUrls: [], youtubeEnabled: false }, true);
  const backend = buildMonitorCoverage(["youtube"], configured, false);

  assert.equal(missing.sources.find((source) => source.source === "rss")?.status, "needs-configuration");
  assert.equal(automatic.attentionCount, 3);
  assert.ok(automatic.sources.filter((source) => ["youtube", "rss", "manual"].includes(source.source)).every((source) => source.status === "needs-configuration"));
  assert.equal(backend.sources.find((source) => source.source === "youtube")?.status, "backend-unavailable");
});

test("unsupported sources never appear runnable", () => {
  const coverage = buildMonitorCoverage(["reddit", "news"], configured, true);

  assert.equal(coverage.runnableCount, 0);
  assert.equal(coverage.attentionCount, 2);
  assert.ok(coverage.sources.filter((source) => ["reddit", "news"].includes(source.source)).every((source) => source.status === "unavailable"));
});
