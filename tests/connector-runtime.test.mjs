import assert from "node:assert/strict";
import test from "node:test";
import { decodeEntities, firstMeta, matchesMonitor, stableId, stripMarkup } from "../supabase/functions/_shared/content.ts";
import { assertPublicUrl } from "../supabase/functions/_shared/security.ts";
import { enrichConnectorMentions, getRunnableSources, mergeRadarMentions } from "../lib/radar/connector-utils.ts";

const monitor = {
  id: "monitor-test",
  name: "Community conversation",
  query: "community AND Singapore NOT jobs",
  description: "",
  projectId: "",
  competitors: [],
  keywords: [],
  excludedKeywords: ["jobs"],
  language: "English",
  market: "Singapore",
  sources: [],
  builder: { includeAll: ["community", "Singapore"], includeAny: [], exclude: ["jobs"] },
  status: "draft",
  dataMode: "empty",
  createdAt: "2026-08-07T00:00:00.000Z",
};

test("connector settings resolve only genuine configured sources", () => {
  assert.deepEqual(getRunnableSources(monitor, {
    rssFeedUrls: ["https://example.com/feed.xml"],
    manualUrls: [],
    youtubeEnabled: true,
  }), ["rss", "youtube"]);
  assert.deepEqual(getRunnableSources({ ...monitor, sources: ["manual"] }, {
    rssFeedUrls: ["https://example.com/feed.xml"],
    manualUrls: [],
    youtubeEnabled: true,
  }), []);
});

test("normalized connector records are enriched and deduplicated for Radar", () => {
  const normalized = {
    id: "rss-one",
    platform: "rss",
    externalId: "one",
    author: "Publication",
    content: "A Singapore community group created a welcoming weekly meetup.",
    url: "https://example.com/one",
    publishedAt: "2026-08-07T00:00:00.000Z",
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    engagement: 0,
    language: "en",
    metadata: { sourceLabel: "Publication feed" },
  };
  const enriched = enrichConnectorMentions([normalized], monitor);
  assert.equal(enriched[0].sourceLabel, "Publication feed");
  assert.equal(enriched[0].sentiment, "positive");
  assert.ok(enriched[0].topics.includes("Community"));
  assert.equal(mergeRadarMentions(enriched, enrichConnectorMentions([{ ...normalized, content: `${normalized.content} Updated.` }], monitor)).length, 1);
});

test("content utilities normalize permitted source text deterministically", () => {
  assert.equal(stripMarkup("<p>Hello &amp; <strong>world</strong></p>"), "Hello & world");
  assert.equal(decodeEntities("Signal &#38; culture"), "Signal & culture");
  assert.equal(firstMeta('<meta property="og:title" content="A useful signal">', ["og:title"]), "A useful signal");
  assert.equal(stableId("https://example.com/article"), stableId("https://example.com/article"));
  assert.equal(matchesMonitor("Singapore community gathering", monitor.builder), true);
  assert.equal(matchesMonitor("Singapore community jobs", monitor.builder), false);
});

test("manual imports reject local and private network targets", () => {
  assert.throws(() => assertPublicUrl("http://localhost/private"), /Private or local/);
  assert.throws(() => assertPublicUrl("http://192.168.1.10/private"), /Private or local/);
  assert.throws(() => assertPublicUrl("file:///etc/passwd"), /Only HTTP and HTTPS/);
  assert.equal(assertPublicUrl("https://example.com/article").hostname, "example.com");
});
