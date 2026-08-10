import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260810091104_phase_7_strategy_pipeline_foundation.sql",
  import.meta.url,
);
const indexMigrationPath = new URL(
  "../supabase/migrations/20260810172826_phase_7_strategy_pipeline_fk_indexes.sql",
  import.meta.url,
);

async function migration() {
  return readFile(migrationPath, "utf8");
}

async function indexMigration() {
  return readFile(indexMigrationPath, "utf8");
}

test("Phase 7 reuses and hardens the existing strategy session and stage tables", async () => {
  const sql = await migration();

  assert.match(sql, /alter table public\.strategy_sessions[\s\S]*alter column created_by set default auth\.uid\(\)/);
  assert.match(sql, /strategy_sessions_id_project_id_key unique \(id, project_id\)/);
  assert.match(sql, /alter table public\.strategy_stages[\s\S]*add column project_id uuid/);
  assert.match(sql, /foreign key \(session_id, project_id\)[\s\S]*references public\.strategy_sessions\(id, project_id\)/);
  assert.match(sql, /strategy_stages_status_check[\s\S]*'draft'[\s\S]*'ready'[\s\S]*'approved'/);
  assert.match(sql, /strategy_stages_confidence_check[\s\S]*'low'[\s\S]*'medium'[\s\S]*'high'/);
  assert.match(sql, /research_gaps text\[\] not null default '\{\}'/);
  assert.match(sql, /strategy_stages_approval_state_check/);
});

test("Phase 7 separates analytical provenance from original stage evidence", async () => {
  const sql = await migration();

  assert.match(sql, /create table public\.strategy_session_inputs/);
  assert.match(sql, /input_type in \('signal', 'ai_message'\)/);
  assert.match(sql, /message\.role = 'assistant'/);
  assert.match(sql, /conversation\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /create table public\.strategy_stage_sources/);
  assert.match(sql, /evidence_type in \([\s\S]*'mention'[\s\S]*'research'[\s\S]*'inspiration'/);
  assert.match(sql, /relationship in \('support', 'contradict', 'context'\)/);
  assert.match(sql, /private\.strategy_original_evidence_exists/);
  assert.match(sql, /Strategy evidence must reference an available source in the same project/);
  assert.doesNotMatch(sql, /evidence_type in \([\s\S]*'ai_message'::public\.item_kind/);
});

test("Phase 7 preserves alternatives, dependencies, approvals, and revisions", async () => {
  const sql = await migration();

  assert.match(sql, /create table public\.strategy_stage_alternatives/);
  assert.match(sql, /status in \('considering', 'retained', 'rejected'\)/);
  assert.match(sql, /create table public\.strategy_stage_dependencies/);
  assert.match(sql, /relationship in \('derives_from', 'qualifies', 'challenges'\)/);
  assert.match(sql, /Strategy dependencies must connect stages in the same session/);
  assert.match(sql, /with recursive ancestry/);
  assert.match(sql, /Strategy stage dependencies cannot contain a cycle/);
  assert.match(sql, /create table public\.strategy_stage_revisions/);
  assert.match(sql, /private\.record_strategy_stage_revision_after_update[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.match(sql, /grant select on table public\.strategy_stage_revisions[\s\S]*to authenticated/);
  assert.doesNotMatch(sql, /grant (?:select,\s*)?insert[^;]*public\.strategy_stage_revisions[^;]*to authenticated/);
  assert.match(sql, /Record an explicit Opportunity before adding a Strategic Proposition/);
  assert.match(sql, /Measured observations and workspace-backed insights require supporting original evidence before approval/);
  assert.match(sql, /A Strategic Proposition must depend directly on an explicit Opportunity/);
});

test("Phase 7 tables use explicit least-privilege grants and permanent-account RLS", async () => {
  const sql = await migration();

  for (const table of [
    "strategy_session_inputs",
    "strategy_stage_alternatives",
    "strategy_stage_sources",
    "strategy_stage_dependencies",
    "strategy_stage_revisions",
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(sql, /create policy "permanent authenticated users only"[\s\S]*as restrictive/);
  assert.match(sql, /private\.accessible_project_ids\(\)/);
  assert.match(sql, /added_by = \(select auth\.uid\(\)\)/);
  assert.match(sql, /created_by = \(select auth\.uid\(\)\)/);
  assert.match(sql, /revoke all on table[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /grant [^;]+ to anon/i);
  assert.match(sql, /grant select, insert, update on table public\.strategy_stages[\s\S]*to authenticated/);
  assert.doesNotMatch(sql, /grant select, insert, update, delete on table public\.strategy_stages[\s\S]*to authenticated/);
  assert.match(sql, /grant select, insert, update on table public\.strategy_stage_alternatives[\s\S]*to authenticated/);
});

test("Phase 7 citations protect evidence and Radar retention", async () => {
  const sql = await migration();

  assert.match(sql, /private\.prevent_strategy_source_delete/);
  assert.match(sql, /Evidence is cited by a strategy stage/);
  assert.match(sql, /before delete on public\.mentions/);
  assert.match(sql, /before delete on public\.research_items/);
  assert.match(sql, /before delete on public\.inspiration_items/);
  assert.match(sql, /strategy_stage_evidence/);
  assert.match(sql, /create or replace function public\.list_evidence_relationships/);
  assert.match(sql, /'strategy_stage'::text/);
  assert.match(sql, /blocking signal and strategy-stage citations/i);
});

test("Phase 7 covers every new foreign-key access path", async () => {
  const sql = await indexMigration();

  assert.match(sql, /strategy_stages_session_project_idx[\s\S]*\(session_id, project_id\)/);
  assert.match(sql, /strategy_session_inputs_session_project_idx[\s\S]*\(session_id, project_id\)/);
  assert.match(sql, /strategy_stage_alternatives_project_idx[\s\S]*\(project_id\)/);
  assert.match(sql, /strategy_stage_dependencies_project_idx[\s\S]*\(project_id\)/);
  assert.match(sql, /strategy_stage_sources_project_idx[\s\S]*\(project_id\)/);
  assert.match(
    sql,
    /strategy_stage_revisions_alternative_idx[\s\S]*alternative_id,[\s\S]*project_id,[\s\S]*stage_id/,
  );
  assert.match(sql, /strategy_stage_revisions_project_idx[\s\S]*\(project_id\)/);
});
