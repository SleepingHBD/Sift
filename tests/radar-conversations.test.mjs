import assert from "node:assert/strict";
import test from "node:test";
import { decodeRadarConversationCursor, encodeRadarConversationCursor, radarMentionFromConversation } from "../lib/radar/conversations.ts";

const monitor = {
  id: "monitor-client",
  cloudId: "monitor-cloud",
  cloudProjectId: "project-cloud",
  name: "Culture watch",
  query: "community",
  description: "",
  projectId: "",
  competitors: [],
  keywords: [],
  excludedKeywords: [],
  language: "Any language",
  market: "",
  sources: [],
  builder: { includeAll: ["community"], includeAny: [], exclude: [] },
  status: "active",
  dataMode: "live",
  createdAt: "2026-08-01T00:00:00Z",
};

test("Radar conversation cursors round-trip without exposing raw cursor JSON", () => {
  const source = { sort: "engagement", primary: "420", secondary: "2026-08-08T12:00:00Z", key: "b93132c8-e430-45ac-914d-8d9facec421a" };
  const encoded = encodeRadarConversationCursor(source);
  assert.equal(encoded.includes("{"), false);
  assert.deepEqual(decodeRadarConversationCursor(encoded), source);
  assert.throws(() => decodeRadarConversationCursor("invalid"), /conversation page cursor is invalid/i);
});

test("maps normalized conversation projections into actionable Radar mentions", () => {
  const mention = radarMentionFromConversation({
    id: "mention-cloud",
    project_id: "project-cloud",
    monitoring_query_id: "monitor-cloud",
    platform: "youtube",
    external_id: "video-1",
    author: "Observer",
    content: "Community spaces are changing.",
    url: "https://example.com/watch?v=1",
    published_at: "2026-08-08T12:00:00Z",
    likes: 10,
    comments: 4,
    shares: 2,
    views: 100,
    engagement: "116",
    language: "en",
    sentiment: "positive",
    sentiment_score: "0.8",
    keywords: ["community", "belonging"],
    metadata: { source: "api" },
    is_important: true,
    review_status: "relevant",
    reviewed_at: "2026-08-08T13:00:00Z",
    created_at: "2026-08-08T12:05:00Z",
    source_name: "YouTube API",
    topic_names: ["Belonging"],
    relevance: 100,
  }, monitor);

  assert.equal(mention.id, "monitor-client:youtube:video-1");
  assert.equal(mention.cloudId, "mention-cloud");
  assert.equal(mention.sourceLabel, "YouTube API");
  assert.deepEqual(mention.topics, ["Belonging"]);
  assert.equal(mention.engagement, 116);
  assert.equal(mention.relevance, 100);
  assert.equal(mention.isImportant, true);
});
