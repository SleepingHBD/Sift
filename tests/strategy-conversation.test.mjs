import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../components/pages/strategy-sessions-page.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/strategy-pipeline/repository.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260810123220_phase_7_conversational_strategy_turns.sql", import.meta.url), "utf8");
const indexMigration = readFileSync(new URL("../supabase/migrations/20260810124457_phase_7_strategy_turn_fk_index.sql", import.meta.url), "utf8");
const indexCleanup = readFileSync(new URL("../supabase/migrations/20260810124613_remove_redundant_strategy_turn_index.sql", import.meta.url), "utf8");

test("Strategy Sessions starts with one unfinished thought and remains gradual", () => {
  assert.match(page, /What are you trying to understand\?/);
  assert.match(page, /It can be incomplete/);
  assert.match(page, /startStrategyConversation/);
  assert.match(page, /addStrategyConversationTurn/);
  assert.match(page, /This saves your thinking\. It does not turn it into a formal insight automatically/);
});

test("the formal pipeline is preserved as a secondary review layer", () => {
  assert.match(page, /Review argument/);
  assert.match(page, /<InsightBuilderPage \/>/);
  assert.match(page, /href="\/strategy-ai"/);
  assert.match(page, /current verified handoff remains available/i);
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
