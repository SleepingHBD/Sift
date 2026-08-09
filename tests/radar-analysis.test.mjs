import assert from "node:assert/strict";
import test from "node:test";
import { radarMonitorAnalysisFromRow } from "../lib/radar/analysis.ts";

const youtubeMention = { cloudId: "cloud-1", platform: "youtube", externalId: "video-1" };

test("maps database Radar aggregates into the existing evidence-linked UI model", () => {
  const analysis = radarMonitorAnalysisFromRow({
    volume: [{ timestamp: "2026-08-06T00:00:00Z", mentions: 8, baseline: 1, spikeId: "spike-1" }],
    sentiment: [{ timestamp: "2026-08-06T00:00:00Z", positive: 63, neutral: 37, negative: 0 }],
    topics: [{
      name: "Community",
      mentions: 8,
      growth: 700,
      sentiment: 63,
      engagement: "828",
      uniqueAuthors: 8,
      topSource: "youtube",
      exampleMentions: [youtubeMention],
    }],
    keywords: [{ keyword: "belonging", count: 8, growth: 700 }],
    spikes: [{
      id: "spike-1",
      timestamp: "2026-08-06T00:00:00Z",
      mentions: 8,
      baseline: 1,
      growth: 700,
      topTopics: [{ name: "Community", mentions: 8 }],
      topSources: [{ name: "youtube", mentions: 8 }],
      unusualKeywords: ["belonging"],
      topMentions: [youtubeMention],
      likelyDrivers: [{ explanation: "Community accounted for 100% of records in this spike.", mentionIds: [youtubeMention] }],
    }],
  }, "monitor-client", "7d");

  assert.deepEqual(analysis.volume[0], {
    timestamp: "2026-08-06T00:00:00.000Z",
    label: "06 Aug",
    mentions: 8,
    baseline: 1,
    spikeId: "spike-1",
  });
  assert.deepEqual(analysis.sentiment[0], {
    timestamp: "2026-08-06T00:00:00.000Z",
    label: "06 Aug",
    positive: 63,
    neutral: 37,
    negative: 0,
  });
  assert.equal(analysis.topics[0].topSource, "YouTube");
  assert.deepEqual(analysis.topics[0].exampleMentionIds, ["monitor-client:youtube:video-1"]);
  assert.deepEqual(analysis.topics[0].exampleMentionCloudIds, ["cloud-1"]);
  assert.equal(analysis.spikes[0].topSources[0].name, "YouTube");
  assert.deepEqual(analysis.spikes[0].topMentionCloudIds, ["cloud-1"]);
  assert.deepEqual(analysis.spikes[0].likelyDrivers[0].mentionIds, ["monitor-client:youtube:video-1"]);
  assert.deepEqual(analysis.spikes[0].likelyDrivers[0].mentionCloudIds, ["cloud-1"]);
});

test("uses safe empty arrays for malformed aggregate payloads", () => {
  const analysis = radarMonitorAnalysisFromRow({
    volume: null,
    sentiment: {},
    topics: [null, { name: "" }],
    keywords: "none",
    spikes: undefined,
  }, "monitor-client", "30d");

  assert.deepEqual(analysis, {
    volume: [],
    sentiment: [],
    topics: [],
    keywords: [],
    spikes: [],
  });
});
