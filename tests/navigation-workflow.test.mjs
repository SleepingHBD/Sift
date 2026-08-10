import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync(new URL("../components/shell/sidebar.tsx", import.meta.url), "utf8");
const appView = readFileSync(new URL("../components/app-view.tsx", import.meta.url), "utf8");
const evidencePage = readFileSync(new URL("../components/pages/evidence-page.tsx", import.meta.url), "utf8");
const captureDialog = readFileSync(new URL("../components/evidence/capture-evidence-dialog.tsx", import.meta.url), "utf8");
const appProvider = readFileSync(new URL("../components/app-provider.tsx", import.meta.url), "utf8");
const strategyPage = readFileSync(new URL("../components/pages/strategy-page.tsx", import.meta.url), "utf8");
const insightBuilderPage = readFileSync(new URL("../components/pages/insight-builder-page.tsx", import.meta.url), "utf8");
const strategySessionsPage = readFileSync(new URL("../components/pages/strategy-sessions-page.tsx", import.meta.url), "utf8");
const homePage = readFileSync(new URL("../components/pages/home-page.tsx", import.meta.url), "utf8");
const projectDialog = readFileSync(new URL("../components/workspace/project-dialog.tsx", import.meta.url), "utf8");
const dynamicRoute = readFileSync(new URL("../app/[section]/page.tsx", import.meta.url), "utf8");

test("the notebook-first shell exposes only four primary destinations", () => {
  assert.match(sidebar, /label: "Today", href: "\/"/);
  assert.match(sidebar, /label: "Notebooks", href: "\/insight-builder"/);
  assert.match(sidebar, /label: "Radar", href: "\/radar"/);
  assert.match(sidebar, /label: "Library", href: "\/evidence"/);
  for (const removed of ["Research", "Inspiration", "Trends", "Brands", "Competitors", "Strategy AI", "Briefs"]) {
    assert.doesNotMatch(sidebar, new RegExp(`label: "${removed}"`));
  }
  assert.doesNotMatch(sidebar, /Guided workflow|sidebar-stage|step: "0/);
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

test("Notebooks retain the conversation-first strategy workspace", () => {
  assert.match(sidebar, /label: "Notebooks"/);
  assert.doesNotMatch(sidebar, /label: "Strategy AI"/);
  assert.doesNotMatch(sidebar, /label: "Insight Builder"/);
  assert.match(sidebar, /href: "\/insight-builder"/);
  assert.match(appView, /"insight-builder": StrategySessionsPage/);
  assert.match(dynamicRoute, /"insight-builder"/);
  assert.match(strategySessionsPage, /Review argument/);
  assert.match(strategySessionsPage, /<InsightBuilderPage \/>/);
  assert.match(insightBuilderPage, /Turn evidence into an argument/);
});

test("Today presents one notebook-first starting point without dashboard theatre", () => {
  assert.match(homePage, /Pick up where you left off/);
  assert.match(homePage, /Create notebook/);
  assert.match(homePage, /Open notebook/);
  assert.doesNotMatch(homePage, /Ask your strategist|Emerging trends|Conversation spikes|AI daily insight/);
});

test("a new notebook requires only a name and hides optional context", () => {
  assert.match(projectDialog, /Notebook name \*/);
  assert.match(projectDialog, /workspace-dialog__optional/);
  assert.match(projectDialog, /Optional · you can do this later/);
  assert.match(projectDialog, /Create notebook/);
});
