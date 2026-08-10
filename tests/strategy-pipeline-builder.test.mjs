import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  STRATEGY_STAGE_DEFINITIONS,
  cleanResearchGaps,
  nextSessionOrigin,
  stageApprovalChecks,
  stageProgress,
} from "../lib/strategy-pipeline/model.ts";

const page = readFileSync(new URL("../components/pages/insight-builder-page.tsx", import.meta.url), "utf8");
const sourcePanel = readFileSync(new URL("../components/strategy-pipeline/source-panel.tsx", import.meta.url), "utf8");
const traceability = readFileSync(new URL("../components/strategy-pipeline/stage-traceability.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/strategy-pipeline/repository.ts", import.meta.url), "utf8");

test("the first Insight Builder keeps the intended reasoning order and claim boundaries", () => {
  assert.deepEqual(
    STRATEGY_STAGE_DEFINITIONS.map((stage) => stage.kind),
    ["observation", "pattern", "tension", "insight", "opportunity"],
  );
  assert.deepEqual(
    STRATEGY_STAGE_DEFINITIONS.map((stage) => stage.claimType),
    ["evidence", "interpretation", "interpretation", "interpretation", "recommendation"],
  );
  assert.equal(stageProgress(["observation", "insight", "insight"]), 2);
});

test("Signal and Strategy AI provenance combine without becoming original evidence", () => {
  assert.equal(nextSessionOrigin("strategist", "signal"), "signal_assisted");
  assert.equal(nextSessionOrigin("signal_assisted", "ai_message"), "mixed");
  assert.equal(nextSessionOrigin("mixed", "signal"), "mixed");
  assert.match(sourcePanel, /Signals are analytical starting points, not original evidence/);
  assert.match(sourcePanel, /Saved AI analysis is a thinking input, never evidence/);
  assert.match(repository, /strategy_session_inputs/);
  assert.match(repository, /strategy_stage_sources/);
});

test("stage editing is durable and the proposition remains explicitly locked", () => {
  assert.match(page, /saveStrategyStage/);
  assert.match(page, /attachStrategyEvidence/);
  assert.match(page, /removeStrategyEvidence/);
  assert.match(page, /Strategic Proposition/);
  assert.match(page, /Locked/);
  assert.match(repository, /\.eq\("project_id", projectId\)/);
});

test("research gaps are normalized for the uncertainty increment", () => {
  assert.deepEqual(cleanResearchGaps("Need interviews\nNeed pricing data\nNeed interviews\n"), ["Need interviews", "Need pricing data"]);
});

test("approval readiness keeps evidence and dependency requirements explicit", () => {
  const base = {
    id: "stage-1",
    sessionId: "session-1",
    projectId: "project-1",
    kind: "insight",
    content: "People use the category to create a sense of belonging.",
    claimType: "interpretation",
    position: 4,
    status: "draft",
    confidence: "medium",
    researchGaps: [],
    approvalNote: null,
    approvedAt: null,
    approvedBy: null,
    alternatives: [],
    revisions: [],
    createdAt: "2026-08-10T00:00:00Z",
    updatedAt: "2026-08-10T00:00:00Z",
  };
  const blocked = stageApprovalChecks({ ...base, sources: [], dependencies: [] });
  assert.deepEqual(blocked.map((check) => check.passed), [true, false, false]);
  const ready = stageApprovalChecks({
    ...base,
    sources: [{ relationship: "support" }],
    dependencies: [{ id: "dependency-1" }],
  });
  assert.deepEqual(ready.map((check) => check.passed), [true, true, true]);
});

test("the Insight Builder exposes uncertainty without adding another workspace section", () => {
  assert.match(traceability, /Review reasoning/);
  assert.match(traceability, /Alternative interpretations/);
  assert.match(traceability, /Stage dependencies/);
  assert.match(traceability, /Revision history/);
  assert.match(repository, /strategy_stage_alternatives/);
  assert.match(repository, /strategy_stage_dependencies/);
  assert.match(repository, /strategy_stage_revisions/);
});
