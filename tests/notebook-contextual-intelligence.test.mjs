import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { relationshipTypeLabel } from "../lib/evidence/relationship-model.ts";

const repository = readFileSync(new URL("../lib/strategy-pipeline/repository.ts", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../components/strategy/send-to-notebook-dialog.tsx", import.meta.url), "utf8");
const radarFeed = readFileSync(new URL("../components/radar/mention-feed.tsx", import.meta.url), "utf8");
const radarPage = readFileSync(new URL("../components/pages/radar-page.tsx", import.meta.url), "utf8");
const evidencePage = readFileSync(new URL("../components/pages/evidence-page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260814072201_phase_7_contextual_intelligence.sql", import.meta.url), "utf8");

test("Radar and Library can send original evidence into a notebook page", () => {
  assert.match(radarFeed, /SendToNotebook|onSendToNotebook/);
  assert.match(radarPage, /radarMentionToEvidenceReference/);
  assert.match(radarPage, /SendToNotebookDialog/);
  assert.match(evidencePage, /SendToNotebookDialog/);
  assert.match(dialog, /The original source stays cited automatically/);
});

test("the notebook dialog asks for only a page and an optional thought", () => {
  assert.match(dialog, /Notebook page/);
  assert.match(dialog, /Your thought <em>Optional/);
  assert.match(dialog, /New page/);
  assert.match(dialog, /You can leave this empty/);
});

test("duplicate source use is checked before a new notebook turn is created", () => {
  const duplicateCheck = repository.indexOf('.from("strategy_session_turn_sources")');
  const turnInsert = repository.indexOf("addStrategyConversationTurn(sessionId, projectId, cleanNote, [evidence])");
  assert.ok(duplicateCheck >= 0);
  assert.ok(turnInsert > duplicateCheck);
  assert.match(repository, /status: "already_attached"/);
  assert.match(dialog, /Nothing will be duplicated/);
});

test("notebook citations are visible in the relationship inspector without bypassing RLS", () => {
  assert.equal(relationshipTypeLabel("notebook"), "Notebook citation");
  assert.match(migration, /create or replace function public\.list_evidence_notebook_relationships/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /private\.accessible_project_ids/);
  assert.match(migration, /strategy_session_turn_sources/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});

test("Radar's everyday feed replaces legacy routing clutter with the notebook action", () => {
  assert.match(radarFeed, />Notebook</);
  assert.doesNotMatch(radarFeed, /Research queue/);
  assert.doesNotMatch(radarFeed, /Inspiration queue/);
  assert.doesNotMatch(radarFeed, />Project</);
});
