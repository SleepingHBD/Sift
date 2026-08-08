import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSource } from "../lib/evidence/source.ts";
import { createInspirationClientRef, inspirationFromRow } from "../lib/inspiration/model.ts";
import { createResearchClientRef, researchFromRow } from "../lib/research/model.ts";

test("source normalization separates permitted web URLs from source labels", () => {
  assert.deepEqual(normalizeSource("https://www.example.com/story"), {
    url: "https://www.example.com/story",
    label: "example.com",
  });
  assert.deepEqual(normalizeSource("Field notes"), { url: null, label: "Field notes" });
});

test("research rows retain project and client identity", () => {
  const item = researchFromRow({
    id: "cloud-research",
    client_ref: "local-research",
    project_id: "cloud-project",
    title: "Community spaces",
    url: "https://example.com/research",
    publication: "Example Journal",
    item_type: "Article",
    key_findings: "People use shared rituals to create belonging.",
    notes: null,
    collection_name: "Community",
    metadata: { tags: ["culture", "community"] },
    review_status: "relevant",
    reviewed_at: "2026-08-08T01:00:00.000Z",
    evidence_assets: [{
      id: "asset-1",
      project_id: "cloud-project",
      research_item_id: "cloud-research",
      bucket_id: "evidence-assets",
      storage_path: "user/cloud-project/local-research/asset.png",
      original_filename: "signal.png",
      mime_type: "image/png",
      byte_size: 2048,
      asset_kind: "image",
      processing_status: "ready",
      created_at: "2026-08-08T00:00:00.000Z",
    }],
    created_at: "2026-08-08T00:00:00.000Z",
    updated_at: "2026-08-08T00:00:00.000Z",
  }, "local-project");

  assert.equal(item.id, "local-research");
  assert.equal(item.cloudId, "cloud-research");
  assert.equal(item.projectId, "local-project");
  assert.deepEqual(item.tags, ["culture", "community"]);
  assert.equal(item.assets?.[0].originalFilename, "signal.png");
  assert.equal(item.assets?.[0].projectId, "local-project");
  assert.equal(item.reviewStatus, "relevant");
  assert.equal(item.reviewedAt, "2026-08-08T01:00:00.000Z");
});

test("inspiration rows retain provenance and stable visual treatment", () => {
  const item = inspirationFromRow({
    id: "cloud-inspiration",
    client_ref: "local-inspiration",
    project_id: "cloud-project",
    title: "A useful campaign",
    item_type: "Campaign",
    url: null,
    brand_name: "Example brand",
    notes: "A strong community mechanic.",
    auto_tags: ["community"],
    metadata: { source_label: "Personal notes", palette: "purple" },
    review_status: "archived",
    reviewed_at: "2026-08-08T01:30:00.000Z",
    created_at: "2026-08-08T00:00:00.000Z",
    updated_at: "2026-08-08T00:00:00.000Z",
  }, "local-project");

  assert.equal(item.source, "Personal notes");
  assert.equal(item.palette, "purple");
  assert.equal(item.projectId, "local-project");
  assert.equal(item.reviewStatus, "archived");
  assert.equal(item.reviewedAt, "2026-08-08T01:30:00.000Z");
});

test("library client references use distinct stable prefixes", () => {
  assert.equal(createResearchClientRef(() => "fixed"), "research-fixed");
  assert.equal(createInspirationClientRef(() => "fixed"), "inspiration-fixed");
});
