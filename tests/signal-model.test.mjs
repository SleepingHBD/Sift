import assert from "node:assert/strict";
import test from "node:test";
import { signalFromRow } from "../lib/signals/model.ts";

const row = {
  id: "signal-1",
  project_id: "project-1",
  topic_id: null,
  title: "Community language",
  observation: "Community language appears more often in the collected posts.",
  kind: "signal",
  status: "candidate",
  movement: "uncertain",
  origin: "strategist",
  scope_note: "Observed only in this project's evidence.",
  strategist_notes: null,
  analysis_changed_at: "2026-08-09T10:00:00.000Z",
  superseded_by_signal_id: null,
  promoted_trend_id: null,
  created_at: "2026-08-09T10:00:00.000Z",
  updated_at: "2026-08-09T10:00:00.000Z",
};

test("signal mapping counts supporting and contradictory evidence separately", () => {
  const signal = signalFromRow(row, [
    { signal_id: row.id, relationship: "support" },
    { signal_id: row.id, relationship: "support" },
    { signal_id: row.id, relationship: "contradict" },
    { signal_id: row.id, relationship: "context" },
  ]);

  assert.deepEqual(signal.evidenceCounts, { support: 2, contradict: 1, context: 1 });
  assert.equal(signal.scopeNote, "Observed only in this project's evidence.");
  assert.equal(signal.latestSnapshot, null);
  assert.equal(signal.analysisChangedAt, row.analysis_changed_at);
  assert.equal(signal.promotedTrendId, null);
});

test("signal mapping exposes the latest assessment version without reinterpreting it", () => {
  const signal = signalFromRow(row, [], {
    id: "snapshot-1",
    signal_id: row.id,
    movement: "new",
    evidence_sufficiency: "limited",
    strength_score: 34,
    analysis_version: "signal-heuristic-v1",
    created_at: "2026-08-09T11:00:00.000Z",
  });

  assert.equal(signal.latestSnapshot?.strengthScore, 34);
  assert.equal(signal.latestSnapshot?.evidenceSufficiency, "limited");
  assert.equal(signal.latestSnapshot?.analysisVersion, "signal-heuristic-v1");
});
