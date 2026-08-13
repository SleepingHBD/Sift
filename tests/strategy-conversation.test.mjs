import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../components/pages/strategy-sessions-page.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/strategy-pipeline/repository.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260810123220_phase_7_conversational_strategy_turns.sql", import.meta.url), "utf8");
const indexMigration = readFileSync(new URL("../supabase/migrations/20260810124457_phase_7_strategy_turn_fk_index.sql", import.meta.url), "utf8");
const indexCleanup = readFileSync(new URL("../supabase/migrations/20260810124613_remove_redundant_strategy_turn_index.sql", import.meta.url), "utf8");
const handoffMigration = readFileSync(new URL("../supabase/migrations/20260810130647_phase_7_strategy_session_handoff.sql", import.meta.url), "utf8");
const universalCaptureMigration = readFileSync(new URL("../supabase/migrations/20260810153551_phase_7_notebook_turn_sources.sql", import.meta.url), "utf8");
const deletionMigration = readFileSync(new URL("../supabase/migrations/20260810160514_guard_notebook_entry_deletion.sql", import.meta.url), "utf8");
const deletionDialog = readFileSync(new URL("../components/strategy/notebook-entry-delete-dialog.tsx", import.meta.url), "utf8");
const pageDeletionMigration = readFileSync(new URL("../supabase/migrations/20260813183323_guard_notebook_page_deletion.sql", import.meta.url), "utf8");
const pageDeletionDialog = readFileSync(new URL("../components/strategy/notebook-page-delete-dialog.tsx", import.meta.url), "utf8");
const handoffPanel = readFileSync(new URL("../components/strategy/strategy-session-handoff.tsx", import.meta.url), "utf8");
const strategyFunction = readFileSync(new URL("../supabase/functions/strategy-ai/index.ts", import.meta.url), "utf8");

test("Strategy Sessions starts with one unfinished thought and remains gradual", () => {
  assert.match(page, /Name this page\./);
  assert.match(page, /Your thoughts stay separate and can develop gradually/);
  assert.match(page, /createStrategySession/);
  assert.match(page, /addStrategyConversationTurn/);
  assert.match(page, /Write naturally\. Sources stay attached to this exact entry; formal strategy can wait/);
});

test("notebook page names are explicit and remain editable", () => {
  assert.match(page, /aria-label="New notebook page name"/);
  assert.match(page, /You can rename this page whenever your thinking changes/);
  assert.match(page, /aria-label="Rename notebook page"/);
  assert.match(page, /renameStrategySession/);
  assert.match(repository, /export async function renameStrategySession/);
  assert.match(repository, /\.update\(\{ title: cleanTitle \}\)/);
  assert.match(repository, /\.eq\("id", sessionId\)/);
  assert.match(repository, /\.eq\("project_id", projectId\)/);
});

test("a notebook page can be permanently deleted only by its creator", () => {
  assert.match(pageDeletionMigration, /drop policy if exists "permanent accounts delete accessible strategy sessions"/);
  assert.match(pageDeletionMigration, /create policy "permanent accounts delete their own strategy sessions"/);
  assert.match(pageDeletionMigration, /created_by = \(select auth\.uid\(\)\)/);
  assert.match(pageDeletionMigration, /private\.accessible_project_ids/);
  assert.match(pageDeletionMigration, /create or replace function public\.delete_notebook_page/);
  assert.match(pageDeletionMigration, /security invoker/);
  assert.match(pageDeletionMigration, /is_anonymous/);
  assert.match(pageDeletionMigration, /session\.created_by = caller_id/);
  assert.match(pageDeletionMigration, /revoke all on function public\.delete_notebook_page\(uuid, uuid\)/);
  assert.match(pageDeletionMigration, /grant execute on function public\.delete_notebook_page\(uuid, uuid\)\s+to authenticated, service_role/);
  assert.match(repository, /export async function deleteNotebookPage/);
  assert.match(repository, /rpc\("delete_notebook_page"/);
});

test("page deletion is explicit, explains its scope, and preserves original evidence", () => {
  assert.match(page, /aria-label="Page actions"/);
  assert.match(page, />Rename page</);
  assert.match(page, />Delete page</);
  assert.match(page, /session\.createdBy === user\?\.id/);
  assert.match(page, /<NotebookPageDeleteDialog/);
  assert.match(page, /const fallback = remaining\[fallbackIndex\] \?\? remaining\[0\]/);
  assert.match(page, /setStartingNew\(true\)/);
  assert.match(pageDeletionDialog, /This permanently removes the whole notebook page/);
  assert.match(pageDeletionDialog, /Research, Inspiration, and Radar records in your Library are not deleted/);
  assert.match(pageDeletionDialog, /Thoughts/);
  assert.match(pageDeletionDialog, /Source links/);
  assert.match(pageDeletionDialog, /Working pieces/);
  assert.match(pageDeletionDialog, /Strategy steps/);
});

test("the formal pipeline is preserved as a secondary review layer", () => {
  assert.match(page, /Review argument/);
  assert.match(page, /<InsightBuilderPage \/>/);
  assert.match(page, /Think with ChatGPT/);
  assert.doesNotMatch(page, /href="\/strategy-ai"/);
});

test("the notebook keeps writing primary and reveals structure only on request", () => {
  assert.match(page, /Notebook memory/);
  assert.match(page, /memoryOpen \? <aside className="strategy-conversation-memory">/);
  assert.match(page, /strategy-conversation-composer__tools/);
  assert.match(page, />Library</);
  assert.match(page, /captureSource\("file"\)/);
  assert.doesNotMatch(page, /setActiveProjectId/);
  assert.doesNotMatch(page, /<span>Notebook<\/span><select/);
});

test("new-page mode remains reversible and the page selector stays available", () => {
  assert.match(page, /const newNotebookPageValue = "__new_notebook_page__"/);
  assert.match(page, /startingNew \? returnToCurrentConversation : beginAnotherConversation/);
  assert.match(page, /startingNew \? "Back to current page" : "New page"/);
  assert.match(page, /value=\{startingNew \? newNotebookPageValue : sessionId\}/);
  assert.match(page, /onChange=\{\(event\) => selectNotebookPage\(event\.target\.value\)\}/);
  assert.doesNotMatch(page, /disabled=\{!sessions\.length \|\| startingNew\}/);
});

test("universal capture keeps notebook evidence project-scoped and citation-ready", () => {
  assert.match(universalCaptureMigration, /create table public\.strategy_session_turn_sources/);
  assert.match(universalCaptureMigration, /alter table public\.strategy_session_turn_sources enable row level security/);
  assert.match(universalCaptureMigration, /private\.strategy_original_evidence_exists/);
  assert.match(universalCaptureMigration, /create or replace function public\.add_strategy_conversation_turn/);
  assert.match(universalCaptureMigration, /jsonb_array_length/);
  assert.match(universalCaptureMigration, /source_count > 12/);
  assert.match(universalCaptureMigration, /security invoker/);
  assert.doesNotMatch(universalCaptureMigration, /grant (update|delete).*strategy_session_turn_sources\s+to authenticated/is);
  assert.match(page, /findNotebookUrl/);
  assert.match(page, /NotebookSourcePicker/);
  assert.match(page, /pendingSources/);
});

test("a strategist can delete only their own unused handwritten notebook entry", () => {
  assert.match(deletionMigration, /grant delete on table public\.strategy_session_turns\s+to authenticated/);
  assert.match(deletionMigration, /created_by = \(select auth\.uid\(\)\)/);
  assert.match(deletionMigration, /role = 'user'/);
  assert.match(deletionMigration, /origin = 'strategist'/);
  assert.match(deletionMigration, /not exists[\s\S]*public\.strategy_session_pieces/);
  assert.match(deletionMigration, /create or replace function public\.delete_strategy_conversation_turn/);
  assert.match(deletionMigration, /security invoker/);
  assert.match(deletionMigration, /revoke all on function public\.delete_strategy_conversation_turn/);
  assert.match(repository, /rpc\("delete_strategy_conversation_turn"/);
  assert.match(page, /canDeleteNotebookTurn/);
  assert.match(page, /Delete notebook entry/);
  assert.match(page, /NotebookEntryDeleteDialog/);
  assert.match(deletionDialog, /The original Research, Inspiration, or Radar evidence remains safely in your Library/);
  assert.match(deletionDialog, /protectedByWorkingPiece/);
});

test("conversation persistence is project-scoped and append-only for browser users", () => {
  assert.match(migration, /create table public\.strategy_session_turns/);
  assert.match(migration, /alter table public\.strategy_session_turns enable row level security/);
  assert.match(migration, /grant select, insert on table public\.strategy_session_turns\s+to authenticated/);
  assert.match(migration, /role = 'user'/);
  assert.match(migration, /origin = 'strategist'/);
  assert.match(migration, /private\.accessible_project_ids/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /revoke all on function public\.start_strategy_conversation\(uuid, text\)/);
  assert.doesNotMatch(migration, /grant (update|delete).*authenticated/i);
  assert.match(indexMigration, /\(session_id, project_id, created_at, id\)/);
  assert.match(indexCleanup, /drop index if exists public\.strategy_session_turns_session_timeline_idx/);
});

test("the repository loads turns in stable timeline order", () => {
  assert.match(repository, /from\("strategy_session_turns"\)/);
  assert.match(repository, /\.order\("created_at", \{ ascending: true \}\)/);
  assert.match(repository, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(repository, /rpc\("start_strategy_conversation"/);
});

test("a verified ChatGPT handoff attaches idempotently and creates optional working pieces", () => {
  assert.match(handoffMigration, /create table public\.strategy_session_pieces/);
  assert.match(handoffMigration, /create table public\.strategy_session_piece_sources/);
  assert.match(handoffMigration, /create or replace function public\.attach_strategy_analysis_to_session/);
  assert.match(handoffMigration, /on conflict \(session_id, ai_message_id\).*do nothing/s);
  assert.match(handoffMigration, /'measured_fact' then 'observation'/);
  assert.match(handoffMigration, /'recommendation' then 'opportunity'/);
  assert.match(handoffMigration, /grant update \(status\).*to authenticated/s);
  assert.doesNotMatch(handoffMigration, /grant insert.*strategy_session_pieces.*authenticated/is);
  assert.match(strategyFunction, /attach_strategy_analysis_to_session/);
  assert.match(strategyFunction, /SESSION_ATTACHMENT_FAILED/);
});

test("the integrated handoff stays inside one strategy conversation", () => {
  assert.match(handoffPanel, /strategySessionHandoffQuestion/);
  assert.match(handoffPanel, /previewStrategyEvidence/);
  assert.match(handoffPanel, /buildStrategyChatGptPrompt/);
  assert.match(handoffPanel, /parseStrategyChatGptResponse/);
  assert.match(handoffPanel, /session\.id/);
  assert.match(handoffPanel, /optional working pieces—not approved strategy/i);
  assert.match(page, /strategyPieceLabels/);
  assert.match(page, /Dismiss/);
  assert.match(page, /Restore/);
});
