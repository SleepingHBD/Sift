import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  STRATEGY_STAGE_DEFINITIONS,
  cleanResearchGaps,
  nextSessionOrigin,
  stageProgress,
} from "../lib/strategy-pipeline/model.ts";

const page = readFileSync(new URL("../components/pages/insight-builder-page.tsx", import.meta.url), "utf8");
const sourcePanel = readFileSync(new URL("../components/strategy-pipeline/source-panel.tsx", import.meta.url), "utf8");
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
