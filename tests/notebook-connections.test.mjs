import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildEmergingThreads,
  notebookConnectionPairKey,
  suggestNotebookConnections,
} from "../lib/strategy-pipeline/connections.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260814063520_phase_7_notebook_connections.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../components/pages/strategy-sessions-page.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/strategy/notebook-connections-panel.tsx", import.meta.url), "utf8");

function turn(id, content, createdAt) {
  return {
    id,
    projectId: "project-1",
    sessionId: "session-1",
    role: "user",
    origin: "strategist",
    content,
    metadata: {},
    aiMessageId: null,
    createdBy: "user-1",
    createdAt,
    sources: [],
  };
}

const turns = [
  turn("a", "People trust local running clubs because community friendship feels genuine.", "2026-08-10T10:00:00Z"),
  turn("b", "Running clubs are growing, but community trust is declining when sponsorship feels commercial.", "2026-08-11T10:00:00Z"),
  turn("c", "Price promotions matter during university lunch hours.", "2026-08-12T10:00:00Z"),
];

test("deterministic suggestions expose their lexical factors and possible contradiction", () => {
  const suggestions = suggestNotebookConnections(turns, []);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].relationship, "contradicts");
  assert.deepEqual(suggestions[0].factors.includes("community"), true);
  assert.match(suggestions[0].rationale, /share/i);
});

test("a handled or dismissed pair is not suggested again", () => {
  const connection = {
    id: "connection-1",
    projectId: "project-1",
    sessionId: "session-1",
    sourceTurnId: "a",
    targetTurnId: "b",
    relationship: "contradicts",
    origin: "deterministic",
    status: "dismissed",
    rationale: null,
    factors: ["community", "running"],
    createdBy: "user-1",
    createdAt: "2026-08-12T10:00:00Z",
    updatedAt: "2026-08-12T10:00:00Z",
  };
  assert.equal(suggestNotebookConnections(turns, [connection]).length, 0);
  assert.equal(notebookConnectionPairKey("b", "a"), notebookConnectionPairKey("a", "b"));
});

test("accepted connections form emerging threads without another stored hierarchy", () => {
  const connections = [
    {
      id: "connection-1",
      projectId: "project-1",
      sessionId: "session-1",
      sourceTurnId: "a",
      targetTurnId: "b",
      relationship: "contradicts",
      origin: "strategist",
      status: "accepted",
      rationale: null,
      factors: [],
      createdBy: "user-1",
      createdAt: "2026-08-12T10:00:00Z",
      updatedAt: "2026-08-12T10:00:00Z",
    },
  ];
  const threads = buildEmergingThreads(turns, connections);
  assert.equal(threads.length, 1);
  assert.deepEqual(new Set(threads[0].turnIds), new Set(["a", "b"]));
  assert.match(threads[0].label, /Community|Running|Trust/);
});

test("connections are private, canonical, explicit, and never auto-accepted", () => {
  assert.match(migration, /create table public\.strategy_session_connections/);
  assert.match(migration, /alter table public\.strategy_session_connections enable row level security/);
  assert.match(migration, /private\.accessible_project_ids/);
  assert.match(migration, /check \(source_turn_id::text < target_turn_id::text\)/);
  assert.match(migration, /origin in \('strategist', 'deterministic'\)/);
  assert.match(migration, /create or replace function public\.set_strategy_session_connection/);
  assert.match(migration, /security invoker/);
  assert.match(panel, /Review each suggestion yourself/);
  assert.match(panel, /onAcceptSuggestion/);
  assert.match(panel, /onDismissSuggestion/);
  assert.match(page, /NotebookConnectionDialog/);
  assert.match(page, /Connect notebook entry/);
});
