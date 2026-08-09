import assert from "node:assert/strict";
import test from "node:test";
import { assessSignal, SIGNAL_ANALYSIS_VERSION } from "../lib/signals/assessment.ts";

test("signal assessment remains cautious when evidence is absent", () => {
  const result = assessSignal({
    supportingEvidence: 0,
    contradictingEvidence: 0,
    sourceDiversity: 0,
    authorDiversity: 0,
  });

  assert.equal(result.evidenceSufficiency, "insufficient");
  assert.equal(result.movement, "uncertain");
  assert.equal(result.strengthScore, 0);
  assert.equal(result.analysisVersion, SIGNAL_ANALYSIS_VERSION);
  assert.match(result.disclaimer, /not a causal or population-level measure/i);
  assert.ok(result.limitations.some((item) => /few supporting sources/i.test(item)));
});

test("missing growth is disclosed rather than silently converted to growth", () => {
  const result = assessSignal({
    supportingEvidence: 6,
    contradictingEvidence: 1,
    sourceDiversity: 3,
    authorDiversity: 8,
    daysSinceNewestEvidence: 2,
  });

  assert.equal(result.factors.recentGrowth.available, false);
  assert.equal(result.factors.recentGrowth.normalized, null);
  assert.ok(result.limitations.some((item) => /growth window/i.test(item)));
  assert.ok(result.researchGaps.some((item) => /second time window/i.test(item)));
});

test("contradictory evidence can override an apparently strong signal", () => {
  const result = assessSignal({
    supportingEvidence: 3,
    contradictingEvidence: 5,
    sourceDiversity: 3,
    authorDiversity: 8,
    recentGrowthPercent: 45,
    daysSinceNewestEvidence: 1,
    previousStrengthScore: 40,
  });

  assert.equal(result.movement, "contradictory");
  assert.ok(result.strengthScore < 80);
});

test("movement compares versioned assessments instead of declaring acceleration from one window", () => {
  const strengthening = assessSignal({
    supportingEvidence: 8,
    contradictingEvidence: 0,
    sourceDiversity: 3,
    authorDiversity: 8,
    recentGrowthPercent: 60,
    daysSinceNewestEvidence: 1,
    previousStrengthScore: 45,
  });
  const firstAssessment = assessSignal({
    supportingEvidence: 8,
    contradictingEvidence: 0,
    sourceDiversity: 3,
    authorDiversity: 8,
    recentGrowthPercent: 60,
    daysSinceNewestEvidence: 1,
  });

  assert.equal(strengthening.movement, "strengthening");
  assert.equal(firstAssessment.movement, "new");
});
