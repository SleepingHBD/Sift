import assert from "node:assert/strict";
import test from "node:test";
import {
  inspirationItemToEvidenceReference,
  radarMentionToEvidenceReference,
  researchItemToEvidenceReference,
} from "../lib/evidence/reference.ts";

test("Radar evidence keeps original conversation content and connector provenance", () => {
  const evidence = radarMentionToEvidenceReference({
    id: "monitor-local:youtube:video-1",
    cloudId: "mention-cloud",
    cloudProjectId: "project-cloud",
    monitorId: "monitor-local",
    platform: "youtube",
    sourceLabel: "YouTube",
    externalId: "video-1",
    author: "A creator",
    content: "A useful observed conversation about community.",
    url: "https://www.youtube.com/watch?v=video-1",
    publishedAt: "2026-08-08T01:00:00.000Z",
    createdAt: "2026-08-08T01:05:00.000Z",
    likes: 10,
    comments: 4,
    shares: 0,
    views: 100,
    engagement: 14,
    language: "en",
    sentiment: "positive",
    sentimentScore: 0.4,
    topics: ["Community"],
    keywords: ["community"],
    relevance: 0.8,
    metadata: { connector_run_id: "run-1", content_hash: "hash-1" },
  });

  assert.equal(evidence.id, "mention-cloud");
  assert.equal(evidence.projectId, "project-cloud");
  assert.equal(evidence.originalContent, "A useful observed conversation about community.");
  assert.equal(evidence.initialInterpretation, null);
  assert.equal(evidence.notes, null);
  assert.equal(evidence.provenance.captureMethod, "connector");
  assert.equal(evidence.provenance.connectorRunId, "run-1");
  assert.equal(evidence.provenance.contentHash, "hash-1");
});

test("manual Radar sources are labelled URL captures rather than connectors", () => {
  const evidence = radarMentionToEvidenceReference({
    id: "manual-1",
    cloudId: "manual-cloud",
    cloudProjectId: "project-cloud",
    monitorId: "monitor-local",
    platform: "manual",
    sourceLabel: "Manual URL imports",
    externalId: "article-1",
    author: "Publication",
    content: "An article selected by the strategist.",
    publishedAt: "2026-08-08T01:00:00.000Z",
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    engagement: 0,
    language: "en",
    sentiment: "neutral",
    sentimentScore: 0,
    topics: [],
    keywords: [],
    relevance: 1,
    metadata: {},
  });

  assert.equal(evidence.provenance.captureMethod, "url");
});

test("Research evidence separates source text, initial interpretation, and working notes", () => {
  const evidence = researchItemToEvidenceReference({
    id: "research-local",
    cloudId: "research-cloud",
    clientRef: "research-local",
    projectId: "project-local",
    title: "Community research",
    publication: "Example Journal",
    url: "https://example.com/research",
    type: "Article",
    date: "08 Aug 2026",
    tags: ["community"],
    summary: "This matters because belonging is becoming a category driver.",
    keyFindings: "This matters because belonging is becoming a category driver.",
    notes: "Compare this with the interview material during synthesis.",
    collection: "Community",
    reviewStatus: "irrelevant",
    reviewedAt: "2026-08-08T02:30:00.000Z",
    createdAt: "2026-08-08T02:00:00.000Z",
    metadata: {
      capture_method: "strategist",
      source_text: "Participants described the space as somewhere they could belong.",
      review_status: "relevant",
      attachments: [{ path: "project-cloud/research.pdf", bucket: "evidence-assets", kind: "document" }],
    },
  }, { cloudProjectId: "project-cloud" });

  assert.equal(evidence.projectId, "project-cloud");
  assert.equal(evidence.projectClientRef, "project-local");
  assert.equal(evidence.originalContent, "Participants described the space as somewhere they could belong.");
  assert.equal(evidence.initialInterpretation, "This matters because belonging is becoming a category driver.");
  assert.equal(evidence.notes, "Compare this with the interview material during synthesis.");
  assert.equal(evidence.reviewStatus, "irrelevant");
  assert.equal(evidence.reviewedAt, "2026-08-08T02:30:00.000Z");
  assert.equal(evidence.provenance.captureMethod, "strategist");
  assert.equal(evidence.attachments[0].path, "project-cloud/research.pdf");
});

test("strategist-captured social evidence stays distinct from connector collection", () => {
  const evidence = researchItemToEvidenceReference({
    id: "social-local",
    cloudId: "social-cloud",
    clientRef: "social-local",
    projectId: "project-local",
    title: "Instagram post · @account",
    publication: "Instagram",
    url: "https://www.instagram.com/p/example",
    type: "Social post",
    date: "08 Aug 2026",
    tags: [],
    summary: "The comments reveal a stronger community motivation.",
    keyFindings: "The comments reveal a stronger community motivation.",
    collection: "Unsorted",
    author: "@account",
    assets: [{
      id: "asset-1",
      projectId: "project-local",
      researchItemId: "social-cloud",
      bucketId: "evidence-assets",
      storagePath: "user/project/research/screenshot.png",
      originalFilename: "screenshot.png",
      mimeType: "image/png",
      byteSize: 1024,
      kind: "image",
      processingStatus: "ready",
      createdAt: "2026-08-08T02:00:00.000Z",
    }],
    createdAt: "2026-08-08T02:00:00.000Z",
    metadata: {
      sift_origin: "social_capture",
      capture_method: "strategist",
      source_text: "Selected post caption.",
      selected_comments: "@viewer: I came for the people.",
      capture_limitation: "Strategist-captured evidence; not collected by a live connector.",
    },
  }, { cloudProjectId: "project-cloud" });

  assert.equal(evidence.provenance.captureMethod, "strategist");
  assert.equal(evidence.originalContent, "Selected post caption.");
  assert.equal(evidence.initialInterpretation, "The comments reveal a stronger community motivation.");
  assert.equal(evidence.notes, null);
  assert.equal(evidence.author, "@account");
  assert.equal(evidence.sourceLabel, "Instagram");
  assert.equal(evidence.attachments[0].path, "user/project/research/screenshot.png");
  assert.equal(evidence.provenance.metadata.selected_comments, "@viewer: I came for the people.");
});

test("Inspiration evidence preserves imported origin and extracted material", () => {
  const evidence = inspirationItemToEvidenceReference({
    id: "inspiration-local",
    cloudId: "inspiration-cloud",
    projectId: "project-local",
    brand: "Personal workspace",
    title: "A community mechanic",
    type: "Campaign",
    source: "example.com",
    url: "https://example.com/campaign",
    tags: ["community"],
    palette: "green",
    savedAt: "08 Aug 2026",
    note: "Worth revisiting for participation design.",
    extractedText: "A campaign invited neighbours to build the work together.",
    createdAt: "2026-08-08T03:00:00.000Z",
    metadata: { sift_origin: "browser_import" },
  }, { cloudProjectId: "project-cloud" });

  assert.equal(evidence.originalContent, "A campaign invited neighbours to build the work together.");
  assert.equal(evidence.initialInterpretation, null);
  assert.equal(evidence.notes, "Worth revisiting for participation design.");
  assert.equal(evidence.provenance.captureMethod, "import");
  assert.equal(evidence.processingStatus, "processed");
});

test("an evidence reference cannot lose its project boundary", () => {
  assert.throws(() => radarMentionToEvidenceReference({
    id: "local-only",
    monitorId: "monitor-local",
    platform: "manual",
    sourceLabel: "Manual URL imports",
    externalId: "local-only",
    author: "Unknown author",
    content: "Local content",
    publishedAt: "2026-08-08T01:00:00.000Z",
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    engagement: 0,
    language: "en",
    sentiment: "neutral",
    sentimentScore: 0,
    topics: [],
    keywords: [],
    relevance: 1,
    metadata: {},
  }), /without a project/);
});
