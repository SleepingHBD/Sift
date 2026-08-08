import assert from "node:assert/strict";
import test from "node:test";
import { decodeEvidenceCursor, encodeEvidenceCursor } from "../lib/evidence/search.ts";
import { evidenceSearchRecordToReference } from "../lib/evidence/reference.ts";

test("evidence cursors are opaque, reversible, and bound to the active sort", () => {
  const source = { sort: "recently-reviewed", primary: "2026-08-08T12:00:00Z", secondary: "2026-08-08T11:00:00Z", key: "research:source-1" };
  const cursor = encodeEvidenceCursor(source);

  assert.doesNotMatch(cursor, /research:source-1/);
  assert.deepEqual(decodeEvidenceCursor(cursor, "recently-reviewed"), source);
  assert.throws(() => decodeEvidenceCursor(cursor, "newest"), /invalid or no longer matches/);
  assert.throws(() => decodeEvidenceCursor("not-a-cursor"), /invalid or no longer matches/);
});

test("server search records retain source identity, organization, and provenance", () => {
  const evidence = evidenceSearchRecordToReference({
    kind: "research",
    item_id: "source-1",
    client_ref: "research-source-1",
    project_id: "project-1",
    project_name: "Project one",
    title: "Running culture notes",
    author: "Strategist",
    source_label: "Field journal",
    original_url: "https://example.com/source",
    canonical_url: "https://example.com/source",
    original_content: "People use running groups to meet each other.",
    published_at: "2026-08-01",
    captured_at: "2026-08-08T12:00:00Z",
    notes: "Watch the social ritual.",
    source_tags: ["community"],
    organization_tags: ["social infrastructure"],
    organization_topics: ["Belonging rituals"],
    topics: [],
    associated_project_ids: ["project-1", "project-2"],
    language: "en",
    processing_status: "unprocessed",
    review_status: "relevant",
    reviewed_at: "2026-08-08T13:00:00Z",
    attachments: [],
    metadata: { capture_method: "strategist" },
    item_type: "field note",
    collection_name: "Running culture",
    key_findings: "Connection matters.",
    ai_summary: null,
    brand_name: null,
    thumbnail_url: null,
    monitor_id: null,
    platform: null,
    external_id: "source-1",
    engagement: 0,
    sentiment: null,
  });

  assert.equal(evidence.cloudId, "source-1");
  assert.equal(evidence.projectId, "project-1");
  assert.deepEqual(evidence.tags, ["community", "social infrastructure"]);
  assert.deepEqual(evidence.organizationTopics, ["Belonging rituals"]);
  assert.deepEqual(evidence.associatedProjectIds, ["project-1", "project-2"]);
  assert.equal(evidence.provenance.captureMethod, "strategist");
  assert.equal(evidence.reviewStatus, "relevant");
});
