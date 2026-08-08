import assert from "node:assert/strict";
import test from "node:test";
import { createProjectClientRef, projectFromRow } from "../lib/projects/model.ts";

test("cloud projects retain stable client references and related context", () => {
  const project = projectFromRow({
    id: "cloud-project-id",
    client_ref: "local-project-id",
    name: "Launch research",
    description: "Understand the category tension.",
    market: "Singapore",
    focus: null,
    status: "active",
    created_at: "2026-08-08T00:00:00.000Z",
    updated_at: "2026-08-08T00:00:00.000Z",
    brands: [
      { id: "secondary", name: "Secondary brand", metadata: {} },
      { id: "primary", name: "Primary brand", metadata: { sift_role: "primary" } },
    ],
    competitors: [{ id: "competitor", name: "Category competitor" }],
    mentions: [{ count: 92 }],
    research_items: [{ count: 3 }],
    insights: [{ count: 1 }],
  });

  assert.equal(project.id, "local-project-id");
  assert.equal(project.cloudId, "cloud-project-id");
  assert.equal(project.brand, "Primary brand");
  assert.deepEqual(project.competitors, ["Category competitor"]);
  assert.deepEqual(project.counts, { mentions: 92, research: 3, insights: 1 });
});

test("new projects receive a deterministic client reference prefix", () => {
  assert.equal(createProjectClientRef(() => "fixed-uuid"), "project-fixed-uuid");
});
