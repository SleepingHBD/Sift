import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  STRATEGY_STAGE_DEFINITIONS,
  cleanResearchGaps,
  nextSessionOrigin,
  stageApprovalChecks,
  stageProgress,
  stageProgressPercent,
  strategicPropositionUnlocked,
  upstreamStageTrail,
} from "../lib/strategy-pipeline/model.ts";

const page = readFileSync(new URL("../components/pages/insight-builder-page.tsx", import.meta.url), "utf8");
const sourcePanel = readFileSync(new URL("../components/strategy-pipeline/source-panel.tsx", import.meta.url), "utf8");
const traceability = readFileSync(new URL("../components/strategy-pipeline/stage-traceability.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/strategy-pipeline/repository.ts", import.meta.url), "utf8");

test("the first Insight Builder keeps the intended reasoning order and claim boundaries", () => {
  assert.deepEqual(
    STRATEGY_STAGE_DEFINITIONS.map((stage) => stage.kind),
    ["observation", "pattern", "tension", "insight", "opportunity", "strategic_proposition"],
  );
  assert.deepEqual(
    STRATEGY_STAGE_DEFINITIONS.map((stage) => stage.claimType),
    ["evidence", "interpretation", "interpretation", "interpretation", "recommendation", "recommendation"],
  );
  assert.equal(stageProgress(["observation", "insight", "insight"]), 2);
  assert.equal(stageProgressPercent(["observation", "pattern", "tension"]), 50);
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

test("stage editing is durable and the proposition unlock is explicit", () => {
  assert.match(page, /saveStrategyStage/);
  assert.match(page, /attachStrategyEvidence/);
  assert.match(page, /removeStrategyEvidence/);
  assert.match(page, /Strategic Proposition/);
  assert.match(page, /Locked/);
  assert.match(page, /strategicPropositionUnlocked/);
  assert.match(page, /ensureStrategyDependency/);
  assert.match(repository, /\.eq\("project_id", projectId\)/);
});

test("the proposition unlocks only after an explicit saved Opportunity", () => {
  assert.equal(strategicPropositionUnlocked([]), false);
  assert.equal(strategicPropositionUnlocked([{ kind: "opportunity", content: "  " }]), false);
  assert.equal(strategicPropositionUnlocked([{ kind: "opportunity", content: "Give people a credible way to participate." }]), true);
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

test("a Strategic Proposition requires a direct Opportunity dependency", () => {
  const opportunity = {
    id: "opportunity-1",
    kind: "opportunity",
    position: 5,
    content: "Help the audience participate without performative pressure.",
    dependencies: [],
    sources: [],
  };
  const proposition = {
    id: "proposition-1",
    kind: "strategic_proposition",
    claimType: "recommendation",
    content: "Make participation feel naturally earned.",
    dependencies: [{ dependsOnStageId: opportunity.id }],
    sources: [],
  };
  assert.deepEqual(stageApprovalChecks(proposition, [opportunity, proposition]).map((check) => check.passed), [true, true]);
  assert.deepEqual(stageApprovalChecks({ ...proposition, dependencies: [{ dependsOnStageId: "pattern-1" }] }, [opportunity]).map((check) => check.passed), [true, false]);
});

test("the inherited trail follows dependencies without copying source records", () => {
  const observation = { id: "observation-1", position: 1, dependencies: [] };
  const insight = { id: "insight-1", position: 4, dependencies: [{ dependsOnStageId: observation.id }] };
  const opportunity = { id: "opportunity-1", position: 5, dependencies: [{ dependsOnStageId: insight.id }] };
  const proposition = { id: "proposition-1", position: 6, dependencies: [{ dependsOnStageId: opportunity.id }] };
  assert.deepEqual(upstreamStageTrail(proposition, [proposition, opportunity, observation, insight]).map((stage) => stage.id), [observation.id, insight.id, opportunity.id]);
});

test("the Insight Builder exposes uncertainty without adding another workspace section", () => {
  assert.match(traceability, /Review reasoning/);
  assert.match(traceability, /Alternative interpretations/);
  assert.match(traceability, /Stage dependencies/);
  assert.match(traceability, /Revision history/);
  assert.match(repository, /strategy_stage_alternatives/);
  assert.match(repository, /strategy_stage_dependencies/);
  assert.match(repository, /strategy_stage_revisions/);
  assert.match(repository, /ignoreDuplicates: true/);
  assert.match(traceability, /Inherited evidence trail/);
});
