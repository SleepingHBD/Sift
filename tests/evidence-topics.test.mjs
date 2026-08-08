import assert from "node:assert/strict";
import test from "node:test";
import {
  evidenceTopicSlug,
  normalizeEvidenceTopics,
  updateEvidenceItemTopics,
} from "../lib/evidence/topics.ts";

const evidence = {
  id: "evidence-1",
  kind: "research",
  projectId: "project-1",
  organizationTopics: ["Existing topic"],
};

test("strategist topic names are normalized, deduplicated, and bounded", () => {
  assert.deepEqual(normalizeEvidenceTopics(" belonging, Pricing tension\nBELONGING, social   rituals "), [
    "belonging",
    "Pricing tension",
    "social rituals",
  ]);
  assert.equal(normalizeEvidenceTopics(Array.from({ length: 14 }, (_, index) => `topic ${index}`)).length, 10);
});

test("topic slugs retain international letters and normalize punctuation", () => {
  assert.equal(evidenceTopicSlug("Gen Z / Social Rituals"), "gen-z-social-rituals");
  assert.equal(evidenceTopicSlug("文化 / Signals"), "文化-signals");
});

test("local topic updates affect only confirmed evidence keys", () => {
  const second = { ...evidence, id: "evidence-2", organizationTopics: ["Keep me"] };
  const assigned = updateEvidenceItemTopics([evidence, second], ["research:evidence-1"], ["Belonging"], "add");
  const removed = updateEvidenceItemTopics(assigned, ["research:evidence-1"], ["existing TOPIC"], "remove");

  assert.deepEqual(assigned[0].organizationTopics, ["Existing topic", "Belonging"]);
  assert.deepEqual(removed[0].organizationTopics, ["Belonging"]);
  assert.deepEqual(removed[1].organizationTopics, ["Keep me"]);
});
