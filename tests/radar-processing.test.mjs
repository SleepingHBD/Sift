import assert from "node:assert/strict";
import test from "node:test";
import { buildBooleanQuery, interpretMonitoringIntent, matchesBooleanQuery, validateBooleanQuery } from "../lib/radar/query-builder.ts";
import {
  analyzeSentiment,
  assignTopics,
  buildRadarAnalytics,
  calculateGrowth,
  normalizeEngagement,
} from "../lib/radar/processing.ts";

test("friendly query builder produces a valid Boolean query", () => {
  const query = buildBooleanQuery({
    includeAll: ["Brand", "Singapore"],
    includeAny: ["running", "product launch"],
    exclude: ["jobs", "stock price"],
  });

  assert.equal(
    query,
    'Brand AND Singapore AND (running OR "product launch") AND NOT jobs AND NOT "stock price"',
  );
  assert.deepEqual(validateBooleanQuery(query), { valid: true, errors: [] });
  assert.equal(validateBooleanQuery('Brand AND ("Singapore').valid, false);
  assert.equal(matchesBooleanQuery("Brand social running in Singapore", query), true);
  assert.equal(matchesBooleanQuery("Brand running jobs in Singapore", query), false);
  assert.equal(matchesBooleanQuery("Competitor social running in Singapore", query), false);
});

test("plain-language monitoring intent creates an inspectable query", () => {
  const interpretation = interpretMonitoringIntent("running clubs in Singapore, excluding job posts and stock price");

  assert.equal(interpretation.subject, "running clubs");
  assert.equal(interpretation.market, "Singapore");
  assert.equal(interpretation.name, "Running clubs — Singapore");
  assert.deepEqual(interpretation.builder.exclude, ["job posts", "stock price"]);
  assert.equal(interpretation.query, '"running clubs" AND Singapore AND NOT "job posts" AND NOT "stock price"');
});

test("deterministic processors keep normalized calculations outside the UI", () => {
  assert.equal(normalizeEngagement({ likes: 10, comments: 3, shares: 2, views: 1000 }), 37);
  assert.equal(analyzeSentiment("Beautiful design, but overpriced").label, "neutral");
  assert.deepEqual(assignTopics("The social run club has a welcoming pace group"), ["Running Clubs"]);
  assert.equal(calculateGrowth(18, 10), 80);
});

function mention(id, publishedAt, topic, overrides = {}) {
  return {
    id,
    monitorId: "monitor-test",
    platform: "reddit",
    externalId: id,
    sourceLabel: "Reddit",
    author: `author-${id}`,
    content: `${topic} conversation example`,
    publishedAt,
    likes: 20,
    comments: 4,
    shares: 1,
    views: 200,
    engagement: 34,
    language: "en",
    sentiment: "positive",
    sentimentScore: 0.5,
    topics: [topic],
    keywords: [topic.toLowerCase(), "community"],
    relevance: 90,
    metadata: {},
    ...overrides,
  };
}

test("Radar analytics detect measured spikes and cite supporting mentions", () => {
  const now = new Date("2026-08-07T12:00:00.000Z");
  const mentions = [];

  for (let index = 0; index < 5; index += 1) {
    mentions.push(mention(`previous-${index}`, new Date(Date.UTC(2026, 6, 25 + index, 15)).toISOString(), "Brand Conversation"));
    mentions.push(mention(`current-${index}`, new Date(Date.UTC(2026, 6, 31 + index, 15)).toISOString(), "Brand Conversation"));
  }

  for (let index = 0; index < 8; index += 1) {
    mentions.push(mention(`spike-${index}`, new Date(Date.UTC(2026, 7, 6, 16, index)).toISOString(), "Running Clubs"));
  }

  const analytics = buildRadarAnalytics(mentions, "7d", now);

  assert.equal(analytics.metrics.totalMentions, 13);
  assert.equal(analytics.metrics.activeSources, 1);
  assert.ok(analytics.spikes.length >= 1);
  const spike = analytics.spikes.find((item) => item.topTopics[0]?.name === "Running Clubs");
  assert.ok(spike);
  assert.ok(spike.growth >= 75);
  assert.equal(spike.likelyDrivers.length, 1);
  assert.ok(spike.likelyDrivers[0].mentionIds.length >= 2);
});
