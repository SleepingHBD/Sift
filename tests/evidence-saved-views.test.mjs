import assert from "node:assert/strict";
import test from "node:test";
import {
  evidenceSavedViewFromRow,
  evidenceSavedViewMatches,
  normalizeEvidenceSavedViewDefinition,
  normalizeEvidenceSavedViewName,
} from "../lib/evidence/saved-views.ts";

const definition = {
  query: "  running clubs  ",
  projectId: "project-1",
  kind: "mention",
  view: "needs-review",
  sort: "recently-reviewed",
  group: "project",
};

test("saved evidence views normalize names and retrieval settings", () => {
  assert.equal(normalizeEvidenceSavedViewName("  Unreviewed   signals  "), "Unreviewed signals");
  assert.throws(() => normalizeEvidenceSavedViewName("   "), /Give this saved view a name/);
  assert.deepEqual(normalizeEvidenceSavedViewDefinition(definition), { ...definition, query: "running clubs" });
});

test("saved evidence views detect modified filters deterministically", () => {
  assert.equal(evidenceSavedViewMatches(definition, { ...definition, query: "running clubs" }), true);
  assert.equal(evidenceSavedViewMatches(definition, { ...definition, group: "status" }), false);
  assert.equal(evidenceSavedViewMatches(definition, { ...definition, projectId: null }), false);
});

test("saved view rows retain only filters and presentation settings", () => {
  const saved = evidenceSavedViewFromRow({
    id: "view-1",
    owner_id: "user-1",
    name: "Unreviewed signals",
    search_query: "running clubs",
    project_id: "project-1",
    kind_filter: "mention",
    view_filter: "needs-review",
    sort_order: "recently-reviewed",
    group_by: "project",
    created_at: "2026-08-08T12:00:00Z",
    updated_at: "2026-08-08T13:00:00Z",
  });

  assert.deepEqual(saved, {
    id: "view-1",
    name: "Unreviewed signals",
    query: "running clubs",
    projectId: "project-1",
    kind: "mention",
    view: "needs-review",
    sort: "recently-reviewed",
    group: "project",
    createdAt: "2026-08-08T12:00:00Z",
    updatedAt: "2026-08-08T13:00:00Z",
  });
});
