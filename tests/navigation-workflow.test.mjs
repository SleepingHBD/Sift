import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync(new URL("../components/shell/sidebar.tsx", import.meta.url), "utf8");
const appView = readFileSync(new URL("../components/app-view.tsx", import.meta.url), "utf8");
const evidencePage = readFileSync(new URL("../components/pages/evidence-page.tsx", import.meta.url), "utf8");
const captureDialog = readFileSync(new URL("../components/evidence/capture-evidence-dialog.tsx", import.meta.url), "utf8");
const appProvider = readFileSync(new URL("../components/app-provider.tsx", import.meta.url), "utf8");
const strategyPage = readFileSync(new URL("../components/pages/strategy-page.tsx", import.meta.url), "utf8");

test("the guided workflow exposes one unified evidence destination", () => {
  assert.doesNotMatch(sidebar, /label: "Research"/);
  assert.match(sidebar, /step: "03",\s*label: "Build evidence"/);
  assert.match(sidebar, /label: "Evidence", href: "\/evidence"/);
  assert.match(sidebar, /step: "06", label: "Create"/);
  assert.doesNotMatch(sidebar, /step: "07"/);
});

test("legacy research navigation opens the filtered Evidence experience", () => {
  assert.match(appView, /section === "research"/);
  assert.match(appView, /activeSection="evidence"><EvidencePage initialKind="research"/);
  assert.equal(existsSync(new URL("../components/pages/research-page.tsx", import.meta.url)), false);
});

test("Evidence retains research capture, import, filtering, and migration entry points", () => {
  assert.match(evidencePage, /Capture evidence/);
  assert.match(evidencePage, /Import CSV/);
  assert.match(evidencePage, /Research, notes & captures/);
  assert.match(evidencePage, /pendingResearchImports/);
  assert.match(evidencePage, /importPendingResearch/);
  assert.doesNotMatch(captureDialog, /href="\/research"/);
  assert.match(captureDialog, /href="\/evidence\?kind=research"/);
});

test("Strategy AI keeps its working session above the route boundary", () => {
  assert.match(appProvider, /strategySession: StrategyWorkingSession/);
  assert.match(appProvider, /setStrategySession: Dispatch<SetStateAction<StrategyWorkingSession>>/);
  assert.match(strategyPage, /strategySession,\s*setStrategySession/);
  assert.doesNotMatch(strategyPage, /const \[question, setQuestion\] = useState/);
  assert.match(strategyPage, /createStrategyWorkingSession\(strategySession\.workspaceUserId, resolvedProjectId\)/);
});
