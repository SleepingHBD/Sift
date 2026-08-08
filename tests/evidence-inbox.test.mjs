import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceInbox, filterEvidenceInbox, organizeEvidenceInbox } from "../lib/evidence/inbox.ts";
import { applyEvidenceOrganization } from "../lib/evidence/organization.ts";

const project = {
  id: "project-local",
  cloudId: "project-cloud",
  name: "Youth culture",
  brand: "",
  market: "Singapore",
  focus: "Understand changing rituals",
  accent: "#d7ff3f",
  counts: { mentions: 1, research: 1, insights: 0 },
};

function mention(overrides = {}) {
  return {
    id: "mention-local",
    cloudId: "mention-cloud",
    cloudProjectId: "project-cloud",
    monitorId: "monitor-local",
    platform: "youtube",
    sourceLabel: "YouTube",
    externalId: "video-1",
    author: "Culture observer",
    content: "Students describe community rituals around late-night food.",
    url: "https://www.youtube.com/watch?v=video-1",
    publishedAt: "2026-08-08T03:00:00.000Z",
    createdAt: "2026-08-08T03:05:00.000Z",
    likes: 10,
    comments: 4,
    shares: 0,
    views: 100,
    engagement: 14,
    language: "en",
    sentiment: "positive",
    sentimentScore: 0.4,
    topics: ["Community rituals"],
    keywords: ["students", "food"],
    relevance: 0.8,
    metadata: {},
    ...overrides,
  };
}

const research = {
  id: "research-local",
  cloudId: "research-cloud",
  clientRef: "research-local",
  projectId: "project-local",
  title: "Night market field note",
  publication: "Personal research",
  type: "Note",
  date: "08 Aug 2026",
  tags: ["belonging"],
  summary: "The ritual matters because it offers low-pressure connection.",
  collection: "Unsorted",
  createdAt: "2026-08-08T02:00:00.000Z",
  metadata: { source_text: "Participants meet after class to eat together.", review_status: "relevant" },
};

const inspiration = {
  id: "inspiration-local",
  cloudId: "inspiration-cloud",
  clientRef: "inspiration-local",
  projectId: "project-local",
  brand: "",
  title: "Community table activation",
  type: "Campaign",
  source: "Campaign archive",
  tags: ["community"],
  palette: "lime",
  savedAt: "2026-08-07",
  note: "A useful spatial expression of belonging.",
  createdAt: "2026-08-07T04:00:00.000Z",
};

test("the inbox unifies project evidence, sorts newest first, and excludes unassigned Radar", () => {
  const dataset = buildEvidenceInbox({
    projects: [project],
    radarRecords: [
      { mention: mention(), projectClientRef: "project-local" },
      { mention: mention({ id: "personal", cloudId: "personal-cloud" }), projectClientRef: "personal-radar" },
    ],
    researchItems: [research],
    inspirationItems: [inspiration],
  });

  assert.deepEqual(dataset.items.map((item) => item.kind), ["mention", "research", "inspiration"]);
  assert.ok(dataset.items.every((item) => item.projectId === "project-cloud"));
  assert.equal(dataset.excludedRadarCount, 1);
});

test("the inbox deduplicates the same source identity", () => {
  const dataset = buildEvidenceInbox({
    projects: [project],
    radarRecords: [
      { mention: mention(), projectClientRef: "project-local" },
      { mention: mention(), projectClientRef: "project-local" },
    ],
    researchItems: [research, research],
    inspirationItems: [],
  });

  assert.equal(dataset.items.length, 2);
});

test("search and filters work across source text, notes, tags, kind, and project", () => {
  const { items } = buildEvidenceInbox({
    projects: [project],
    radarRecords: [{ mention: mention(), projectClientRef: "project-local" }],
    researchItems: [research],
    inspirationItems: [inspiration],
  });

  const bySourceText = filterEvidenceInbox(items, { query: "after class", projectId: "all", kind: "all", view: "all" });
  assert.deepEqual(bySourceText.map((item) => item.id), ["research-cloud"]);

  const byNote = filterEvidenceInbox(items, { query: "spatial expression", projectId: "all", kind: "inspiration", view: "all" });
  assert.deepEqual(byNote.map((item) => item.id), ["inspiration-cloud"]);

  const needsReview = filterEvidenceInbox(items, { query: "", projectId: "project-cloud", kind: "all", view: "needs-review" });
  assert.deepEqual(needsReview.map((item) => item.id).sort(), ["inspiration-cloud", "mention-cloud"]);
});

test("the recent view uses a deterministic seven-day boundary", () => {
  const { items } = buildEvidenceInbox({
    projects: [project],
    radarRecords: [{ mention: mention(), projectClientRef: "project-local" }],
    researchItems: [research],
    inspirationItems: [inspiration],
  });
  const recent = filterEvidenceInbox(items, {
    query: "",
    projectId: "all",
    kind: "all",
    view: "recent",
    now: new Date("2026-08-08T12:00:00.000Z"),
  });
  assert.equal(recent.length, 3);
  const none = filterEvidenceInbox(items, {
    query: "",
    projectId: "all",
    kind: "all",
    view: "recent",
    now: new Date("2026-08-20T12:00:00.000Z"),
  });
  assert.equal(none.length, 0);
});

test("project filters include evidence linked to another project without changing its source project", () => {
  const { items } = buildEvidenceInbox({
    projects: [project],
    radarRecords: [{ mention: mention(), projectClientRef: "project-local" }],
    researchItems: [],
    inspirationItems: [],
  });
  const linked = items.map((item) => applyEvidenceOrganization(item, {
    tagsByEvidence: {},
    projectIdsByEvidence: { "mention:mention-cloud": ["project-linked"] },
  }));

  const filtered = filterEvidenceInbox(linked, { query: "", projectId: "project-linked", kind: "all", view: "all" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].projectId, "project-cloud");
  assert.deepEqual(filtered[0].associatedProjectIds, ["project-cloud", "project-linked"]);
});

test("sorting and grouping keep deterministic evidence sections", () => {
  const { items } = buildEvidenceInbox({
    projects: [project],
    radarRecords: [{ mention: mention(), projectClientRef: "project-local" }],
    researchItems: [research],
    inspirationItems: [inspiration],
  });
  const groups = organizeEvidenceInbox(items, { sort: "oldest", group: "kind" });

  assert.deepEqual(groups.map((group) => group.id), ["inspiration", "research", "mention"]);
  assert.deepEqual(groups.map((group) => group.items.length), [1, 1, 1]);
});
