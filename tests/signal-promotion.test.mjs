import assert from "node:assert/strict";
import test from "node:test";
import { signalPromotionGate } from "../lib/signals/promotion.ts";

const signal = {
  id: "signal-1",
  projectId: "project-1",
  topicId: null,
  title: "Community language",
  observation: "Community language appears more often.",
  kind: "signal",
  status: "watching",
  movement: "stable",
  origin: "strategist",
  scopeNote: "Observed in this project's collected evidence.",
  strategistNotes: "",
  analysisChangedAt: "2026-08-09T10:00:00.000Z",
  supersededBySignalId: null,
  promotedTrendId: null,
  evidenceCounts: { support: 6, contradict: 1, context: 0 },
  latestSnapshot: null,
  createdAt: "2026-08-09T09:00:00.000Z",
  updatedAt: "2026-08-09T10:00:00.000Z",
};

const snapshot = {
  id: "snapshot-1",
  movement: "stable",
  evidenceSufficiency: "sufficient",
  strengthScore: 72,
  analysisVersion: "signal-heuristic-v1",
  method: "deterministic",
  supportingCount: 6,
  contradictingCount: 1,
  sourceDiversity: 3,
  authorDiversity: 4,
  growthRate: null,
  recencyDays: 1,
  factors: {},
  limitations: ["No comparable growth window is available yet."],
  researchGaps: [],
  createdAt: "2026-08-09T11:00:00.000Z",
};

test("promotion opens only after every explicit evidence gate is met", () => {
  const gate = signalPromotionGate(signal, snapshot);
  assert.equal(gate.eligible, true);
  assert.ok(gate.requirements.every((requirement) => requirement.met));
});

test("a stale assessment cannot promote a changed signal", () => {
  const gate = signalPromotionGate(
    { ...signal, analysisChangedAt: "2026-08-09T12:00:00.000Z" },
    snapshot,
  );
  assert.equal(gate.eligible, false);
  assert.equal(gate.requirements.find((requirement) => requirement.id === "current")?.met, false);
});

test("hypotheses and contradiction-heavy snapshots remain unpromotable", () => {
  const gate = signalPromotionGate(
    { ...signal, kind: "hypothesis" },
    { ...snapshot, movement: "contradictory", contradictingCount: 4 },
  );
  assert.equal(gate.eligible, false);
  assert.equal(gate.requirements.find((requirement) => requirement.id === "claim")?.met, false);
  assert.equal(gate.requirements.find((requirement) => requirement.id === "contradiction")?.met, false);
});
