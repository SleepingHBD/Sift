import assert from "node:assert/strict";
import test from "node:test";
import {
  canDeleteEvidenceFromLibrary,
  relationshipTypeLabel,
  summarizeEvidenceRelationships,
} from "../lib/evidence/relationship-model.ts";

const relationship = (overrides = {}) => ({
  type: "tag",
  id: "relationship-1",
  targetId: "target-1",
  targetProjectId: "project-1",
  label: "Community",
  blocking: false,
  metadata: {},
  ...overrides,
});

test("strategic citations sort before removable organization links", () => {
  const summary = summarizeEvidenceRelationships([
    relationship(),
    relationship({ id: "relationship-2", type: "brief", label: "Launch brief", blocking: true }),
    relationship({ id: "relationship-3", type: "project", label: "Culture study" }),
    relationship({ id: "relationship-4", type: "insight", label: "Belonging tension", blocking: true }),
  ]);

  assert.equal(summary.blockingCount, 2);
  assert.equal(summary.removableCount, 2);
  assert.deepEqual(summary.items.map((item) => item.type), ["brief", "insight", "project", "tag"]);
});

test("relationship labels explain their strategic role", () => {
  assert.equal(relationshipTypeLabel("signal"), "Signal evidence");
  assert.equal(relationshipTypeLabel("strategy_stage"), "Insight Builder citation");
  assert.equal(relationshipTypeLabel("insight"), "Insight");
  assert.equal(relationshipTypeLabel("brief"), "Creative brief");
  assert.equal(relationshipTypeLabel("asset"), "Private attachment");
  assert.equal(relationshipTypeLabel("saved"), "Saved connection");
});

test("library deletion is available only for user-curated evidence sources", () => {
  assert.equal(canDeleteEvidenceFromLibrary("research"), true);
  assert.equal(canDeleteEvidenceFromLibrary("inspiration"), true);
  assert.equal(canDeleteEvidenceFromLibrary("mention"), false);
});
