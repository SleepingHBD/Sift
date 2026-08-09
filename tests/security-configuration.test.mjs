import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("production publishing remains an explicit manual action", async () => {
  const workflow = await read(".github/workflows/deploy-pages.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
});

test("the Pages workflow uses Node 24 compatible action runtimes", async () => {
  const workflow = await read(".github/workflows/deploy-pages.yml");

  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /pnpm\/action-setup@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /actions\/configure-pages@v6/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.doesNotMatch(workflow, /@(v3|v4)(?:\s|$)/m);
});

test("Radar requires verified JWTs and server-side quotas", async () => {
  const [config, handler, collection] = await Promise.all([
    read("supabase/config.toml"),
    read("supabase/functions/radar-connectors/index.ts"),
    read("supabase/functions/_shared/collection.ts"),
  ]);

  assert.match(config, /verify_jwt\s*=\s*true/);
  assert.match(collection, /consume_radar_quota/);
  assert.match(handler, /65_536/);
});

test("the client cannot perform manual identity linking", async () => {
  const provider = await read("components/auth/auth-provider.tsx");

  assert.doesNotMatch(provider, /linkIdentity/);
  assert.match(provider, /signInWithOAuth/);
});

test("signing out revokes only the current browser session", async () => {
  const provider = await read("components/auth/auth-provider.tsx");

  assert.match(provider, /signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(provider, /client\.auth\.signOut\(\)/);
});

test("the static export declares a constrained browser content policy", async () => {
  const layout = await read("app/layout.tsx");

  assert.match(layout, /Content-Security-Policy/);
  assert.match(layout, /object-src 'none'/);
  assert.match(layout, /connect-src 'self' https:\/\/\*\.supabase\.co/);
  assert.match(layout, /process\.env\.NODE_ENV === "development"/);
  assert.match(layout, /: "script-src 'self' 'unsafe-inline'"/);
});

test("Phase 1 project imports use authenticated ownership and an idempotency constraint", async () => {
  const [migration, returningPolicy] = await Promise.all([
    read("supabase/migrations/20260808040530_phase_1_project_repository.sql"),
    read("supabase/migrations/20260808042221_phase_1_project_returning_policy.sql"),
  ]);

  assert.match(migration, /alter column owner_id set default auth\.uid\(\)/);
  assert.match(migration, /unique \(owner_id, client_ref\)/);
  assert.match(migration, /projects_owner_status_created_idx/);
  assert.match(returningPolicy, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(returningPolicy, /or public\.can_access_project\(id\)/);
});

test("Phase 1 evidence libraries derive creators and support idempotent project imports", async () => {
  const migration = await read("supabase/migrations/20260808054040_phase_1_research_inspiration_repository.sql");

  assert.match(migration, /research_items[\s\S]*alter column created_by set default auth\.uid\(\)/);
  assert.match(migration, /inspiration_items[\s\S]*alter column created_by set default auth\.uid\(\)/);
  assert.match(migration, /unique \(project_id, client_ref\)/);
  assert.match(migration, /created_by = \(select auth\.uid\(\)\)/);
  assert.match(migration, /project_created_cursor_idx/);
});

test("Phase 1 Radar hydration uses idempotent monitor and run references with cursor indexes", async () => {
  const [migration, foreignKeys, database] = await Promise.all([
    read("supabase/migrations/20260808055940_phase_1_radar_repository.sql"),
    read("supabase/migrations/20260808061236_phase_1_radar_foreign_key_indexes.sql"),
    read("supabase/functions/_shared/database.ts"),
  ]);

  assert.match(migration, /monitoring_queries_project_client_ref_key/);
  assert.match(migration, /unique \(project_id, client_ref\)/);
  assert.match(migration, /monitor_runs_query_client_ref_key/);
  assert.match(migration, /mentions_query_created_cursor_idx/);
  assert.match(migration, /monitor_runs_query_started_cursor_idx/);
  assert.match(foreignKeys, /mention_topics_topic_id_idx/);
  assert.match(foreignKeys, /monitoring_query_competitors_competitor_id_idx/);
  assert.match(database, /id: runId,[\s\S]*client_ref: runId/);
});

test("Phase 1 Radar annotations are per-user, project-bound, and idempotent", async () => {
  const migration = await read("supabase/migrations/20260808063042_phase_1_radar_annotations.sql");

  assert.match(migration, /mention_notes[\s\S]*alter column user_id set default auth\.uid\(\)/);
  assert.match(migration, /saved_items[\s\S]*alter column user_id set default auth\.uid\(\)/);
  assert.match(migration, /unique nulls not distinct/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /mention\.project_id = saved_items\.project_id/);
  assert.match(migration, /mention\.project_id = mention_notes\.project_id/);
  assert.match(migration, /mention_notes_user_project_updated_cursor_idx/);
  assert.match(migration, /saved_items_user_project_kind_created_cursor_idx/);
});

test("Phase 1 covers the remaining relationship foreign keys", async () => {
  const migration = await read("supabase/migrations/20260808064946_phase_1_remaining_foreign_key_indexes.sql");

  assert.match(migration, /competitor_group_members_competitor_id_idx/);
  assert.match(migration, /project_members_user_id_idx/);
  assert.match(migration, /trend_mentions_mention_id_idx/);
});

test("Phase 2 URL extraction is authenticated, RLS-scoped, rate-limited, and network constrained", async () => {
  const [handler, security, quota] = await Promise.all([
    read("supabase/functions/radar-connectors/index.ts"),
    read("supabase/functions/_shared/security.ts"),
    read("supabase/migrations/20260808092926_phase_2_evidence_extraction_quota.sql"),
  ]);

  assert.match(handler, /action === "extract-url"/);
  assert.match(handler, /context\.supabase\.from\("projects"\)/);
  assert.match(handler, /consumeEvidenceExtractionQuota/);
  assert.match(security, /resolveDns/);
  assert.match(security, /redirect: "manual"/);
  assert.match(security, /Private or local network URLs are not allowed/);
  assert.match(quota, /minute_limit constant integer := 15/);
  assert.match(quota, /day_limit constant integer := 300/);
  assert.match(quota, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(quota, /grant execute[^;]+to authenticated/);
});

test("Phase 2 file evidence is private, restricted, and project scoped", async () => {
  const migration = await read("supabase/migrations/20260808100353_phase_2_private_evidence_assets.sql");

  assert.match(migration, /'evidence-assets'[\s\S]*false,[\s\S]*20971520/);
  assert.match(migration, /image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp[\s\S]*application\/pdf/);
  assert.match(migration, /alter table public\.evidence_assets enable row level security/);
  assert.match(migration, /revoke all on table public\.evidence_assets from public, anon/);
  assert.match(migration, /created_by = \(select auth\.uid\(\)\)/);
  assert.match(migration, /storage\.foldername\(storage_path\)\)\[2\] = project_id::text/);
  assert.match(migration, /project members upload evidence storage[\s\S]*\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  assert.doesNotMatch(migration, /for update[\s\S]*on storage\.objects/);
});

test("Phase 3 review state is constrained and additive across existing evidence sources", async () => {
  const migration = await read("supabase/migrations/20260808112128_phase_3_evidence_review_status.sql");

  assert.match(migration, /alter table public\.mentions[\s\S]*review_status text not null default 'unreviewed'/);
  assert.match(migration, /alter table public\.research_items[\s\S]*review_status text not null default 'unreviewed'/);
  assert.match(migration, /alter table public\.inspiration_items[\s\S]*review_status text not null default 'unreviewed'/);
  assert.match(migration, /check \(review_status in \('unreviewed', 'relevant', 'irrelevant', 'archived'\)\)/);
  assert.match(migration, /metadata ->> 'review_status'/);
  assert.doesNotMatch(migration, /create table/);
  assert.doesNotMatch(migration, /create policy|grant .*anon/i);
});

test("Phase 3 evidence organization preserves source integrity and target-project access", async () => {
  const migration = await read("supabase/migrations/20260808120349_phase_3_evidence_organization.sql");

  assert.match(migration, /saved evidence belongs to its source project/);
  assert.match(migration, /mention\.project_id = saved_items\.project_id/);
  assert.match(migration, /research\.project_id = saved_items\.project_id/);
  assert.match(migration, /inspiration\.project_id = saved_items\.project_id/);
  assert.match(migration, /project evidence links target an accessible project/);
  assert.match(migration, /public\.can_access_project\(destination_id\)/);
  assert.match(migration, /evidence tags belong to their project/);
  assert.match(migration, /evidence tag links match their source project/);
  assert.match(migration, /item_tags_project_item_lookup_idx/);
  assert.match(migration, /saved_items_project_links_lookup_idx/);
  assert.doesNotMatch(migration, /grant .*anon/i);
});

test("Phase 3 evidence search is security-invoker, full-text indexed, and keyset paginated", async () => {
  const migration = await read("supabase/migrations/20260808123456_phase_3_evidence_search_pagination.sql");

  assert.match(migration, /create or replace function public\.search_evidence_page/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /search_vector @@ search_query/);
  assert.match(migration, /websearch_to_tsquery\('english'::regconfig/);
  assert.match(migration, /captured_at < cursor_primary_time/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.match(migration, /revoke all[\s\S]*from public, anon/);
  assert.doesNotMatch(migration, /security definer/i);
  assert.doesNotMatch(migration, /\boffset\b/i);
  assert.doesNotMatch(migration, /create table/i);
});

test("Phase 3 saved evidence views are private, constrained, and contain no evidence copies", async () => {
  const [migration, permanentIdentity] = await Promise.all([
    read("supabase/migrations/20260808130752_phase_3_evidence_saved_views.sql"),
    read("supabase/migrations/20260808131842_phase_3_saved_views_permanent_identity.sql"),
  ]);

  assert.match(migration, /create table public\.evidence_saved_views/);
  assert.match(migration, /owner_id uuid not null default auth\.uid\(\)/);
  assert.match(migration, /project_id uuid references public\.projects\(id\) on delete set null/);
  assert.match(migration, /evidence_saved_views_owner_name_idx/);
  assert.match(migration, /evidence_saved_views_project_id_idx/);
  assert.match(migration, /alter table public\.evidence_saved_views enable row level security/);
  assert.match(migration, /to authenticated[\s\S]*\(select auth\.uid\(\)\) = owner_id/);
  assert.match(migration, /public\.can_access_project\(project_id\)/);
  assert.match(migration, /revoke all on table public\.evidence_saved_views from public, anon/);
  assert.match(migration, /grant select, insert, update, delete[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /original_content|source_text|excerpt|evidence_id/);
  assert.match(permanentIdentity, /as restrictive/);
  assert.match(permanentIdentity, /is_anonymous/);
  assert.match(permanentIdentity, /to authenticated/);
});

test("Phase 3 evidence deletion is RLS-invoker guarded and protects strategic citations", async () => {
  const [guard, isolatedQueries, trendIdentity] = await Promise.all([
    read("supabase/migrations/20260808132952_phase_3_evidence_relationships_guarded_deletion.sql"),
    read("supabase/migrations/20260808133300_fix_evidence_relationship_query_ambiguity.sql"),
    read("supabase/migrations/20260808133350_fix_trend_relationship_identity.sql"),
  ]);

  assert.match(guard, /create or replace function public\.list_evidence_relationships/);
  assert.match(guard, /create or replace function public\.delete_evidence_item/);
  assert.match(guard, /security invoker/g);
  assert.match(guard, /destination in \('insight_evidence', 'insight_seed', 'brief'\)/);
  assert.match(guard, /raise exception 'Evidence is still cited by % protected relationship/);
  assert.match(guard, /insight_sources_source_lookup_idx/);
  assert.match(guard, /brief_sources_source_lookup_idx/);
  assert.match(guard, /revoke all[\s\S]*from public, anon/);
  assert.match(guard, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(guard, /security definer/i);
  assert.match(isolatedQueries, /Keep each RLS-protected relationship lookup in its own statement/);
  assert.match(trendIdentity, /'trend'::text,[\s\S]*trend\.id,[\s\S]*trend\.id/);
  assert.doesNotMatch(trendIdentity, /security definer/i);
});

test("Phase 3 CSV imports are bounded, private, audited, and safe to retry", async () => {
  const [migration, identifierFix] = await Promise.all([
    read("supabase/migrations/20260808140433_phase_3_evidence_csv_import.sql"),
    read("supabase/migrations/20260808140709_fix_evidence_csv_import_tag_identity.sql"),
  ]);

  assert.match(migration, /create table public\.evidence_import_runs/);
  assert.match(migration, /create table public\.evidence_import_rows/);
  assert.match(migration, /total_rows integer[\s\S]*between 0 and 500/);
  assert.match(migration, /unique \(owner_id, client_ref\)/);
  assert.match(migration, /alter table public\.evidence_import_runs enable row level security/);
  assert.match(migration, /alter table public\.evidence_import_rows enable row level security/);
  assert.match(migration, /as restrictive[\s\S]*is_anonymous/);
  assert.match(migration, /security invoker/g);
  assert.match(migration, /public\.can_access_project\(p_project_id\)/);
  assert.match(migration, /revoke all on table public\.evidence_import_runs from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert, update on table public\.evidence_import_runs to authenticated/);
  assert.match(migration, /metadata ->> 'content_hash'/);
  assert.match(migration, /where run\.owner_id = caller_id and run\.client_ref = p_client_ref/);
  assert.match(migration, /'source_text', candidate_source_text/);
  assert.doesNotMatch(migration, /raw_csv|csv_content|file_contents/);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(identifierFix, /resolved_tag_id/);
  assert.doesNotMatch(identifierFix, /security definer/i);
});

test("Phase 3 strategist topics and notes are project-scoped, searchable, and RLS-invoker safe", async () => {
  const migration = await read("supabase/migrations/20260808150723_phase_3_evidence_topics_and_notes.sql");

  assert.match(migration, /create table public\.evidence_topics/);
  assert.match(migration, /create table public\.evidence_topic_assignments/);
  assert.match(migration, /foreign key \(topic_id, project_id\)/);
  assert.match(migration, /evidence topic assignments match their source/);
  assert.match(migration, /as restrictive[\s\S]*is_anonymous/);
  assert.match(migration, /alter table public\.evidence_topics enable row level security/);
  assert.match(migration, /alter table public\.evidence_topic_assignments enable row level security/);
  assert.match(migration, /revoke all[\s\S]*from anon/);
  assert.match(migration, /create or replace function public\.update_evidence_note/);
  assert.match(migration, /security invoker/g);
  assert.match(migration, /metadata - 'strategist_note'/);
  assert.match(migration, /organization_topics/);
  assert.match(migration, /to_tsvector\('english'::regconfig, coalesce\(mention\.metadata ->> 'strategist_note'/);
  assert.match(migration, /from public\.evidence_topic_assignments assignment/);
  assert.doesNotMatch(migration, /security definer/i);
});

test("Phase 3 acceptance remediation caches project access and removes topic links before evidence deletion", async () => {
  const migration = await read("supabase/migrations/20260808160014_optimize_phase_3_evidence_access.sql");

  assert.match(migration, /create or replace function private\.accessible_project_ids\(\)/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /revoke all on function private\.accessible_project_ids\(\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /id = any\(\(\(select private\.accessible_project_ids\(\)\)\)::uuid\[\]\)/);
  assert.match(migration, /alter policy "project members manage mentions"/);
  assert.match(migration, /alter policy "project members manage research_items"/);
  assert.match(migration, /alter policy "project members manage inspiration_items"/);
  assert.match(migration, /create or replace function public\.delete_evidence_item/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /delete from public\.evidence_topic_assignments[\s\S]*delete from public\.research_items/);
  assert.doesNotMatch(migration, /delete from public\.evidence_topic_assignments assignment\s+where not exists/);
  assert.doesNotMatch(migration, /grant .*anon/i);
});

test("Phase 4 Radar prevents overlapping runs and records recoverable execution state", async () => {
  const [migration, collection, database] = await Promise.all([
    read("supabase/migrations/20260809043245_phase_4_monitor_run_leases.sql"),
    read("supabase/functions/_shared/collection.ts"),
    read("supabase/functions/_shared/database.ts"),
  ]);

  assert.match(migration, /monitor_runs_one_active_query_idx[\s\S]*where status = 'running'/);
  assert.match(migration, /monitor_runs_expired_lease_idx/);
  assert.match(migration, /monitor_runs_cursor_source_run_id_fkey/);
  assert.match(database, /beginCollectionRun/);
  assert.match(database, /lease_expires_at\.lt/);
  assert.match(database, /MonitorRunConflictError/);
  assert.match(collection, /readMonitorCursor/);
  assert.match(collection, /advanceMonitorCursor/);
  assert.match(collection, /failCollectionRun/);
});

test("Phase 4 Radar summaries are RLS-invoker, permanent-account scoped, and coverage aware", async () => {
  const migration = await read("supabase/migrations/20260809050928_phase_4_radar_monitor_summary.sql");

  assert.match(migration, /mentions_query_observed_cursor_idx/);
  assert.match(migration, /create or replace function public\.radar_monitor_summary/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /private\.accessible_project_ids\(\)/);
  assert.match(migration, /is_anonymous/);
  assert.match(migration, /current_mentions bigint/);
  assert.match(migration, /previous_mentions bigint/);
  assert.match(migration, /source_counts jsonb/);
  assert.match(migration, /coalesce\(published_at, created_at\)/);
  assert.match(migration, /revoke all[\s\S]*from public, anon/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /security definer/i);
});

test("Phase 4 Radar analysis is RLS-invoker and returns evidence-linked aggregates", async () => {
  const migration = await read("supabase/migrations/20260809053855_phase_4_radar_monitor_analysis.sql");

  assert.match(migration, /create or replace function public\.radar_monitor_analysis/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /private\.accessible_project_ids\(\)/);
  assert.match(migration, /is_anonymous/);
  assert.match(migration, /generate_series/);
  assert.match(migration, /exampleMentions/);
  assert.match(migration, /likelyDrivers/);
  assert.match(migration, /topMentions/);
  assert.match(migration, /revoke all[\s\S]*from public, anon/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /security definer/i);
});

test("Phase 4 Radar conversation pages use permanent-account RLS and keyset cursors", async () => {
  const migration = await read("supabase/migrations/20260809065000_phase_4_radar_conversation_pagination.sql");

  assert.match(migration, /create or replace function public\.radar_conversation_page/);
  assert.match(migration, /create or replace function public\.radar_mentions_by_ids/);
  assert.match(migration, /security invoker/g);
  assert.match(migration, /private\.accessible_project_ids\(\)/);
  assert.match(migration, /is_anonymous/);
  assert.match(migration, /websearch_to_tsquery\('english'::regconfig/);
  assert.match(migration, /\(item\.observed_at, item\.id\) < \(cursor_primary_time, cursor_key\)/);
  assert.match(migration, /mentions_query_engagement_cursor_idx/);
  assert.match(migration, /limit page_size \+ 1/);
  assert.match(migration, /cardinality\(p_mention_ids\) > 50/);
  assert.match(migration, /revoke all[\s\S]*from public, anon/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /security definer/i);
  assert.doesNotMatch(migration, /\boffset\b/i);
});

test("Phase 4 monitor lifecycle preferences are additive and retention preview remains non-destructive by default", async () => {
  const [migration, dialog] = await Promise.all([
    read("supabase/migrations/20260809070413_phase_4_monitor_schedule_retention_preferences.sql"),
    read("components/radar/monitor-dialog.tsx"),
  ]);

  assert.match(migration, /alter table public\.monitoring_queries/);
  assert.match(migration, /schedule_frequency text not null default 'manual'/);
  assert.match(migration, /schedule_enabled boolean not null default false/);
  assert.match(migration, /retention_days smallint/);
  assert.match(migration, /retention_days is null or retention_days in \(90, 180, 365\)/);
  assert.match(migration, /monitoring_queries_scheduled_due_idx[\s\S]*where enabled[\s\S]*schedule_enabled/);
  assert.match(migration, /create or replace function public\.radar_retention_preview/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /is_anonymous/);
  assert.match(migration, /mention\.is_important/);
  assert.match(migration, /public\.saved_items/);
  assert.match(migration, /public\.insight_sources/);
  assert.match(migration, /public\.brief_sources/);
  assert.match(migration, /revoke all[\s\S]*from public, anon/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /security definer/i);
  assert.doesNotMatch(migration, /delete from|pg_cron|pg_net/i);
  assert.match(dialog, /Automatic runs/);
  assert.match(dialog, /Nothing is eligible for retention cleanup while/);
  assert.match(dialog, /Save this monitor first, then return here to opt in/);
  assert.match(dialog, /schedulerAvailable && !paused && scheduleFrequency !== "manual"/);
});

test("Phase 4 audited Radar retention is explicit, bounded, protected, and service-role only", async () => {
  const [migration, dialog, scheduler, repository] = await Promise.all([
    read("supabase/migrations/20260809112942_phase_4_audited_radar_retention.sql"),
    read("components/radar/monitor-dialog.tsx"),
    read("supabase/functions/radar-scheduler/index.ts"),
    read("lib/radar/repository.ts"),
  ]);

  assert.match(migration, /retention_enabled boolean not null default false/);
  assert.match(migration, /not retention_enabled[\s\S]*retention_days is not null[\s\S]*schedule_enabled/);
  assert.match(migration, /create table public\.radar_retention_runs/);
  assert.match(migration, /alter table public\.radar_retention_runs enable row level security/);
  assert.match(migration, /revoke all on table public\.radar_retention_runs[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.radar_retention_runs[\s\S]*to authenticated/);
  assert.match(migration, /project_id = any\(\(\(select private\.accessible_project_ids\(\)\)\)::uuid\[\]\)/);
  assert.match(migration, /mention\.review_status <> 'unreviewed'/);
  assert.match(migration, /public\.mention_notes/);
  assert.match(migration, /public\.saved_items/);
  assert.match(migration, /public\.item_tags/);
  assert.match(migration, /public\.evidence_topic_assignments/);
  assert.match(migration, /public\.insight_sources/);
  assert.match(migration, /public\.brief_sources/);
  assert.match(migration, /public\.trend_mentions/);
  assert.match(migration, /for update of mention skip locked/);
  assert.match(migration, /pg_advisory_xact_lock\(/);
  assert.match(migration, /pg_advisory_xact_lock_shared\(/);
  assert.match(migration, /p_batch_limit < 1 or p_batch_limit > 500/);
  assert.match(migration, /delete from public\.mentions mention/);
  assert.match(migration, /revoke all on function public\.enforce_radar_retention\(uuid, integer\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.enforce_radar_retention\(uuid, integer\)[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(dialog, /Enable automatic retention/);
  assert.match(dialog, /remove at most 250 eligible conversations and record an audit/);
  assert.match(dialog, /Saved, cited, noted, tagged, important, trend-linked, and reviewed conversations are always protected/);
  assert.match(repository, /retention_enabled: monitor\.status !== "paused"[\s\S]*monitor\.retentionEnabled/);
  assert.match(scheduler, /succeeded[\s\S]*runScheduledRetention/);
  assert.match(scheduler, /enforce_radar_retention/);
  assert.match(scheduler, /p_batch_limit: 250/);
});

test("Phase 4 scheduled Radar uses Vault, atomic claims, and the shared collection path", async () => {
  const [migration, activationFix, permissionFix, config, scheduler, connector, collection, repository] = await Promise.all([
    read("supabase/migrations/20260809074058_phase_4_trusted_radar_scheduler.sql"),
    read("supabase/migrations/20260809082520_fix_trusted_radar_scheduler_activation.sql"),
    read("supabase/migrations/20260809084521_grant_authenticated_radar_schedule_calculator.sql"),
    read("supabase/config.toml"),
    read("supabase/functions/radar-scheduler/index.ts"),
    read("supabase/functions/radar-connectors/index.ts"),
    read("supabase/functions/_shared/collection.ts"),
    read("lib/radar/repository.ts"),
  ]);

  assert.match(config, /\[functions\.radar-scheduler\][\s\S]*verify_jwt\s*=\s*true/);
  assert.match(migration, /create extension if not exists pg_net/);
  assert.match(migration, /create extension if not exists pg_cron/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /for update of query skip locked/);
  assert.match(migration, /schedule_claim_expires_at/);
  assert.match(migration, /grant execute on function public\.claim_due_radar_monitors[\s\S]*to service_role/);
  assert.match(migration, /cron\.schedule[\s\S]*sift-radar-scheduler/);
  assert.doesNotMatch(migration, /delete from public\.mentions/i);
  assert.match(activationFix, /select count\(\*\)[\s\S]*vault\.decrypted_secrets/);
  assert.doesNotMatch(activationFix, /group by true/i);
  assert.match(activationFix, /replace\(function_ddl, 'current_time', 'scheduler_now'\)/);
  assert.match(activationFix, /pg_catalog\.now\(\)/);
  assert.doesNotMatch(activationFix, /delete from public\.mentions/i);
  assert.match(permissionFix, /revoke all on function private\.next_radar_schedule_after[\s\S]*from public, anon/);
  assert.match(permissionFix, /grant execute on function private\.next_radar_schedule_after[\s\S]*to authenticated, service_role/);
  assert.doesNotMatch(permissionFix, /security definer/i);
  assert.match(scheduler, /x-sift-scheduler-token/);
  assert.match(scheduler, /claim_due_radar_monitors/);
  assert.match(scheduler, /finalize_radar_schedule_claim/);
  assert.match(scheduler, /runRadarCollection[\s\S]*"scheduled"/);
  assert.match(connector, /runRadarCollection[\s\S]*"manual"/);
  assert.match(collection, /consume_radar_quota/);
  assert.match(collection, /beginCollectionRun/);
  assert.match(collection, /persistCollection/);
  assert.match(repository, /connector_configs/);
  assert.match(repository, /schedule_enabled: monitor\.status !== "paused"/);
});

test("Phase 5 signals are project-scoped, evidence-traceable, and do not expose mutable assessments", async () => {
  const [migration, indexes, relationshipRepository] = await Promise.all([
    read("supabase/migrations/20260809124742_phase_5_signal_foundation.sql"),
    read("supabase/migrations/20260809125109_phase_5_signal_fk_indexes.sql"),
    read("lib/evidence/relationships.ts"),
  ]);

  assert.match(migration, /create table public\.signals/);
  assert.match(migration, /create table public\.signal_evidence/);
  assert.match(migration, /create table public\.signal_snapshots/);
  assert.match(migration, /foreign key \(signal_id, project_id\)/g);
  assert.match(migration, /relationship in \('support', 'contradict', 'context'\)/);
  assert.match(migration, /scope_note text not null default/);
  assert.match(migration, /not a population-level claim/);
  assert.match(migration, /alter table public\.signals enable row level security/);
  assert.match(migration, /alter table public\.signal_evidence enable row level security/);
  assert.match(migration, /alter table public\.signal_snapshots enable row level security/);
  assert.match(migration, /private\.accessible_project_ids\(\)/);
  assert.match(migration, /is_anonymous/);
  assert.match(migration, /private\.signal_evidence_source_exists/);
  assert.match(migration, /Signal evidence must reference an available source in the same project/);
  assert.match(migration, /signal_evidence[\s\S]*'signal_evidence'::text/);
  assert.match(migration, /'signal'::text,[\s\S]*true,/);
  assert.match(migration, /grant select, insert on table public\.signal_snapshots[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /grant select, insert, update, delete on table public\.signal_snapshots/);
  assert.doesNotMatch(migration, /grant .*anon/i);
  assert.match(indexes, /signal_evidence_signal_project_idx[\s\S]*\(signal_id, project_id\)/);
  assert.match(indexes, /signal_snapshots_signal_project_idx[\s\S]*\(signal_id, project_id\)/);
  assert.match(relationshipRepository, /new Set<.*>\(\["signal"/);
});

test("Phase 5 corrections preserve history and promotion remains database gated", async () => {
  const migration = await read("supabase/migrations/20260809135140_phase_5_signal_corrections_and_promotion.sql");
  const hardening = await read("supabase/migrations/20260809141447_harden_signal_operation_rpc_boundary.sql");

  assert.match(migration, /create table public\.signal_revisions/);
  assert.match(migration, /create table public\.signal_lineage/);
  assert.match(migration, /alter table public\.signal_revisions enable row level security/);
  assert.match(migration, /alter table public\.signal_lineage enable row level security/);
  assert.match(migration, /grant select on table public\.signal_revisions, public\.signal_lineage[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete).*signal_(revisions|lineage)[\s\S]*to authenticated/i);
  assert.match(migration, /private\.record_signal_revision_after_update/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /create or replace function public\.merge_signals/);
  assert.match(migration, /create or replace function public\.split_signal/);
  assert.match(migration, /create or replace function public\.promote_signal_to_trend/);
  assert.match(migration, /assessment\.created_at < candidate\.analysis_changed_at/);
  assert.match(migration, /assessment\.supporting_count <> actual_supporting_count/);
  assert.match(migration, /actual_source_diversity < 3/);
  assert.match(migration, /actual_contradicting_count > actual_supporting_count \/ 2/);
  assert.match(migration, /not coalesce\(\(+select auth\.jwt\(\)\)/);
  assert.match(migration, /private\.accessible_project_ids\(\)/);
  assert.match(migration, /revoke all on function public\.merge_signals/);
  assert.match(migration, /grant execute on function public\.promote_signal_to_trend\(uuid\)[\s\S]*to authenticated, service_role/);
  assert.match(hardening, /alter function public\.merge_signals\(uuid, uuid\[\]\) set schema private/);
  assert.match(hardening, /rename to promote_signal_to_trend_internal/);
  assert.match(hardening, /create or replace function public\.merge_signals[\s\S]*security invoker/);
  assert.match(hardening, /create or replace function public\.split_signal[\s\S]*security invoker/);
  assert.match(hardening, /create or replace function public\.promote_signal_to_trend[\s\S]*security invoker/);
  assert.match(hardening, /set search_path = ''/);
  assert.doesNotMatch(hardening, /create or replace function public\.[\s\S]*security definer/);
});
