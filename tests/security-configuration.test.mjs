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
  const [config, handler] = await Promise.all([
    read("supabase/config.toml"),
    read("supabase/functions/radar-connectors/index.ts"),
  ]);

  assert.match(config, /verify_jwt\s*=\s*true/);
  assert.match(handler, /consume_radar_quota/);
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
