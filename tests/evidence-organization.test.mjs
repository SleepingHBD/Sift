import assert from "node:assert/strict";
import test from "node:test";
import {
  addEvidenceItemProject,
  addOrganizationProject,
  applyEvidenceOrganization,
  normalizeEvidenceTags,
  updateEvidenceItemTags,
  updateOrganizationTags,
} from "../lib/evidence/organization.ts";

const evidence = {
  id: "evidence-1",
  kind: "research",
  projectId: "project-1",
  tags: ["Source label"],
  organizationTags: [],
  associatedProjectIds: ["project-1"],
};

test("tag input is trimmed, deduplicated case-insensitively, and bounded", () => {
  assert.deepEqual(normalizeEvidenceTags(" community, Pricing\nCOMMUNITY, youth   culture "), [
    "community",
    "Pricing",
    "youth culture",
  ]);
  assert.equal(normalizeEvidenceTags(Array.from({ length: 15 }, (_, index) => `tag ${index}`)).length, 10);
});

test("organization overlays preserve source labels and provenance project identity", () => {
  const organized = applyEvidenceOrganization(evidence, {
    tagsByEvidence: { "research:evidence-1": ["Shared tag", "source label"] },
    projectIdsByEvidence: { "research:evidence-1": ["project-2"] },
  });

  assert.deepEqual(organized.tags, ["Source label", "Shared tag"]);
  assert.deepEqual(organized.organizationTags, ["Shared tag", "source label"]);
  assert.equal(organized.projectId, "project-1");
  assert.deepEqual(organized.associatedProjectIds, ["project-1", "project-2"]);
});

test("local organization updates only confirmed evidence keys", () => {
  const tagged = updateOrganizationTags({ tagsByEvidence: {}, projectIdsByEvidence: {} }, ["research:evidence-1"], ["Signal"], "add");
  const linked = addOrganizationProject(tagged, ["research:evidence-1"], "project-2");
  const removed = updateOrganizationTags(linked, ["research:evidence-1"], ["signal"], "remove");

  assert.deepEqual(linked.tagsByEvidence["research:evidence-1"], ["Signal"]);
  assert.deepEqual(linked.projectIdsByEvidence["research:evidence-1"], ["project-2"]);
  assert.deepEqual(removed.tagsByEvidence["research:evidence-1"], []);
});

test("server-paged evidence updates only confirmed rows without losing source tags", () => {
  const first = { ...evidence, tags: ["Source label", "Signal"], organizationTags: ["Signal"] };
  const second = { ...evidence, id: "evidence-2", tags: ["Keep me"] };
  const removed = updateEvidenceItemTags([first, second], ["research:evidence-1"], ["signal"], "remove");
  const tagged = updateEvidenceItemTags(removed, ["research:evidence-1"], ["New signal"], "add");
  const linked = addEvidenceItemProject(tagged, ["research:evidence-1"], "project-2");

  assert.deepEqual(tagged[0].tags, ["Source label", "New signal"]);
  assert.deepEqual(tagged[0].organizationTags, ["New signal"]);
  assert.deepEqual(tagged[1].tags, ["Keep me"]);
  assert.deepEqual(linked[0].associatedProjectIds, ["project-1", "project-2"]);
});
