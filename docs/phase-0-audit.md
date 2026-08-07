# Phase 0 architecture and data-safety audit

Audit date: 8 August 2026

Status: **Complete.** Audit, live hardening, controlled cross-user RLS verification, permanent GitHub ownership, permanent-account route protection, Radar abuse controls, and remote migration-history synchronization are complete.

## Scope

This audit covers the current Sift repository, browser persistence, connected Supabase project, authentication configuration, Data API exposure, database migrations, Edge Function boundary, Storage state, advisors, and visible product actions.

No user-created domain records were deleted. The existing project ownership reference was transferred to the permanent GitHub identity, and three obsolete anonymous Auth users plus their sessions were permanently removed after verifying that they owned no remaining domain records. No website deployment was performed.

## Executive findings

1. The live Supabase project is healthy. All eight repository migrations, including the Phase 0 and permanent-identity hardening migrations, are applied and recorded in the remote migration history.
2. The database contains one project, one monitor, one monitor run, one source, 92 mentions, four topics, and 92 mention-topic relationships. These records must be preserved.
3. The application is still device-first: projects, research, inspiration, monitor definitions, notes, saves, important flags, connector settings, and Radar display state are read primarily from `localStorage`.
4. Connector runs persist genuine records to Supabase, but normal application hydration does not read the workspace back from Supabase.
5. GitHub OAuth is the sole permanent sign-in method. The GitHub OAuth App and Supabase provider are active, the production and local redirect URLs are configured, and the existing project is owned by the permanent GitHub identity.
6. Supabase Auth contains one permanent user and zero anonymous users. New registrations, anonymous sign-ins, email authentication, and manual identity linking are disabled.
7. All 32 public tables have RLS enabled. The `anon` Postgres role has no table SELECT privilege. The `authenticated` role has SELECT, INSERT, UPDATE, and DELETE grants on all 32 public tables, with RLS providing row authorization.
8. The Data API settings report both configured schemas exposed, explicit table exposure at 0 of 32, and automatic exposure of new tables disabled. Phase 1 must test each intended client table explicitly rather than infer access from grants alone.
9. Before hardening, the Security Advisor reported zero errors and 38 warnings. After hardening, permanent-account protection, and disabling anonymous sign-ins, a fresh run reports zero errors and one warning: leaked-password protection is disabled. Sift's active application sign-in path uses GitHub OAuth, so this password-specific warning is recorded but does not block Phase 0.
10. Before hardening, the Performance Advisor reported zero errors, 11 warnings, and 39 suggestions. After hardening and a fresh lint run it reports zero errors, zero warnings, and 39 informational suggestions.
11. Supabase Storage has no buckets. File and screenshot capture cannot be considered implemented.
12. The `radar-connectors` Edge Function is deployed with the platform JWT gate enabled. Its handler requires `auth: "user"`, derives ownership from verified claims, rejects oversized request bodies, and consumes an atomic per-user quota before connector work begins. A request without an authorization header was verified to return HTTP 401.
13. The project has no scheduled Supabase backup on the current plan. A logical export is required before the hardening migration is applied.
14. A pre-migration logical export was saved locally under the git-ignored `work/backups` directory before the live change. It contains the seven populated domain tables plus export metadata.

## Live backend snapshot

### Project

- Supabase project: Signal
- Project reference: `mgghyjffxovanmaoudsv`
- Region: Southeast Asia, Singapore
- Status during audit: Healthy
- Database migration history: all eight repository migrations applied and recorded
- Edge Functions: one deployed function, `radar-connectors`
- Storage buckets: none
- Scheduled backups: none shown

### Applied migrations

| Version | Name |
| --- | --- |
| `202608070001` | `initial_schema` |
| `202608070002` | `radar_core` |
| `202608070003` | `connector_runtime` |
| `20260807112919` | `data_api_grants` |
| `20260807145944` | `phase_0_security_foundation` |
| `20260807170412` | `permanent_identity_and_radar_rate_limits` |
| `20260807171459` | `fix_radar_rate_limit_clock` |
| `20260807171930` | `explicitly_deny_direct_rate_limit_access` |

The Phase 0 migration `20260807145944_phase_0_security_foundation.sql` was applied through the signed-in Supabase SQL Editor on 7 August 2026. Its private authorization helper, security-invoker wrapper, policy role restrictions, and all 28 expected indexes were verified live before the missing ledger row was registered through the authenticated Supabase administration connection on 8 August 2026. The later permanent-identity migrations add a restrictive non-anonymous policy to every public table, revoke unused table capabilities, and provide service-role-only Radar quotas. A fresh migration listing confirms that the local and remote histories contain the same eight versions.

### Existing domain data

The dashboard table estimates showed:

| Table | Estimated rows |
| --- | ---: |
| `projects` | 1 |
| `monitoring_queries` | 1 |
| `monitor_runs` | 1 |
| `sources` | 1 |
| `mentions` | 92 |
| `topics` | 4 |
| `mention_topics` | 92 |
| All other Sift domain tables | 0 |

These are existing records, not seed data. Any migration or repository change must preserve them.

Post-migration verification returned the same counts: one project, one monitor, one monitor run, one source, 92 mentions, four topics, and 92 mention-topic relationships.

## Browser storage to database map

| Browser key | Current contents | Intended durable location | Migration handling |
| --- | --- | --- | --- |
| `sift-theme` | Light/dark preference | Browser preference; optional future profile field | Keep local |
| `sift-active-project-personal` | Active project client ID | Browser preference or profile preference | Keep local initially; remap to cloud UUID |
| `sift-user-projects-v1` | Projects and local counters | `projects`, `brands`, `competitors` | Idempotent import, then remove domain payload |
| `sift-user-inspiration-v1` | Inspiration items | `inspiration_items`, tags and assets | Idempotent import, then remove |
| `sift-user-research-v1` | Research items | `research_items`, tags and assets | Idempotent import, then remove |
| `sift-saved-items-personal` | Saved entity IDs | `saved_items` | Remap client IDs and import |
| `sift-radar-monitors-v2` | Monitor definitions | `monitoring_queries` | Match on project and `client_ref` |
| `sift-radar-mentions-v1` | Collected normalized mentions by monitor | `mentions` | Prefer existing cloud rows; import only missing genuine records |
| `sift-radar-runs-v1` | Recent run summaries | `monitor_runs` | Prefer cloud runs; import only auditable compatible records |
| `sift-radar-connector-settings-v1` | RSS URLs, manual URLs, YouTube toggle | `connector_configs` or encrypted server configuration | Migrate non-secret settings only |
| `sift-radar-evidence-personal-v1` | Mention destination links | `saved_items`, `insight_sources`, `brief_sources` | Resolve destination IDs before import |
| `sift-radar-notes-personal-v1` | Mention notes | `mention_notes` | Resolve mention UUIDs and import |
| `sift-radar-important-personal-v1` | Important mention IDs | `mentions.is_important` or user-specific saved state | Decide single-user versus future per-user semantics before import |

## Current data flow

```text
Browser form
  -> React state
  -> localStorage

Radar run
  -> authenticated Edge Function
  -> permitted connector
  -> normalized mention processing
  -> Supabase project / monitor / source / mention / topic / run rows
  -> response copied into localStorage for application display
```

The missing flow is the reverse cloud read:

```text
Supabase rows
  -> authenticated repository
  -> paginated project state
  -> application UI
```

Phase 1 should implement that reverse flow and then remove domain records from browser storage.

## Authentication audit

### Current configuration

- New user signups: disabled after provisioning the permanent user
- Anonymous sign-ins: disabled and verified in the Supabase dashboard on 8 August 2026
- Email authentication: disabled
- Manual identity linking: disabled
- GitHub OAuth: enabled and owns the existing Sift workspace
- Other OAuth providers: disabled
- CAPTCHA/Turnstile: not required for Sift's current authentication flow because anonymous sign-ins are disabled

### Risk

Anonymous users would receive the `authenticated` Postgres role. Sift therefore applies a restrictive policy that rejects an `is_anonymous` JWT on every public table, even if anonymous sign-ins are accidentally re-enabled or an old token remains unexpired. All obsolete anonymous Auth rows have also been removed.

### Phase 1 decision

Sift uses GitHub OAuth as its sole permanent sign-in method. The project ownership reference was transferred transactionally to the existing GitHub identity after checking every Auth foreign-key dependency. Controlled RLS tests confirmed that the GitHub identity can see the project and the retired anonymous identity cannot. Workspace routes require a verified, non-anonymous session; the Account route remains public so the owner can sign in or recover access.

Browser domain caches are copied into user-scoped keys on the linked account's first authenticated load. The legacy values are retained for Phase 1's reviewed cloud migration and backup. A different GitHub account on the same browser cannot claim or hydrate those legacy values.

## Database security audit

### Confirmed controls

- RLS is enabled on all 32 public tables.
- `anon` has no SELECT privilege on the Sift tables.
- Project ownership is derived from the authenticated user rather than accepted from connector request payloads.
- The static bundle contains only public Supabase values.
- The YouTube key remains in Edge Function secrets.
- No service-role key was found in the client repository or public environment names.
- New Data API table auto-exposure is disabled in the dashboard.

### Findings to fix

#### P0-SEC-01: exposed authorization helper

`public.can_access_project(uuid)` is `SECURITY DEFINER`, uses `search_path = public`, and has default function privileges. It is required to avoid recursive RLS checks, but it should not be a privileged function in the exposed schema.

Applied fix: moved the privileged lookup to `private.can_access_project`, set an empty search path and explicit caller identity, restricted execution, and retained a non-privileged public compatibility wrapper for existing policies.

#### P0-SEC-02: directly executable RLS event helper

`public.rls_auto_enable()` is a hosted Supabase event-trigger helper with a safe `pg_catalog` search path, but default privileges make it appear directly executable to client roles.

Applied fix: preserved the event trigger and revoked direct execution from client roles. The migration guards this statement so local environments without the hosted helper still work.

#### P0-SEC-03: mutable trigger search path

`public.set_updated_at()` has no explicit `search_path`.

Applied fix: set an empty search path, schema-qualified time functions, and removed unnecessary client execution.

#### P0-SEC-04: implicit PUBLIC policy roles

All 36 public-table policies were created without a `TO` clause, so their policy role is `PUBLIC`. The `anon` role currently lacks table grants, but the intent should still be explicit.

Applied fix: moved current policies to `TO authenticated` and added a restrictive permanent-user policy that explicitly rejects anonymous JWTs.

#### P0-SEC-05: broad authenticated table grants

The authenticated role has full CRUD grants on all 32 public tables. RLS remains authoritative, but Phase 1 should grant only the operations each repository actually needs and explicitly expose only required Data API tables.

This tightening is deferred until the repository access matrix is complete; prematurely removing grants would break connector deletion fallback and future cloud reads.

#### P0-SEC-06: backup gap

The dashboard shows no scheduled backups. A logical export of existing Sift tables is required before applying the prepared hardening migration.

## Database performance audit

### RLS initialization warnings

Six policy definitions call `auth.uid()` directly rather than using a statement-initialized subquery. These occur on user profiles, project ownership, project membership, and mention notes.

Applied fix: used `(select auth.uid())` in direct policy predicates and in the private authorization helper.

### Overlapping membership policies

`project_members` has a SELECT policy plus an owner `FOR ALL` policy. This causes multiple permissive policies to run for the same action.

Applied fix: retained the membership SELECT policy and split owner management into INSERT, UPDATE, and DELETE policies.

### Missing foreign-key indexes

The live query found 28 unindexed foreign-key columns:

- `ai_conversations.project_id`
- `ai_conversations.user_id`
- `ai_messages.conversation_id`
- `brands.project_id`
- `briefs.created_by`
- `briefs.project_id`
- `competitor_groups.project_id`
- `competitors.brand_id`
- `competitors.project_id`
- `creative_territories.insight_id`
- `creative_territories.project_id`
- `creative_territories.strategy_session_id`
- `insights.created_by`
- `insights.project_id`
- `inspiration_items.created_by`
- `inspiration_items.project_id`
- `item_tags.project_id`
- `mention_notes.project_id`
- `monitor_runs.connector_config_id`
- `monitor_runs.project_id`
- `monitoring_queries.brand_id`
- `research_items.created_by`
- `research_items.project_id`
- `sources.connector_config_id`
- `strategy_sessions.created_by`
- `strategy_sessions.project_id`
- `trends.project_id`
- `trends.topic_id`

The prepared migration adds covering indexes for all 28 findings.

## Edge Function audit

### Strengths

- Connector execution happens server-side.
- Only RSS, manual public URLs, and official YouTube are registered.
- Request sources are allow-listed.
- Input lengths and URL counts are bounded.
- Manual URLs reject credentials, unsafe protocols, private hosts, nonstandard ports, oversized responses, and excessive redirects.
- Ownership is taken from verified user claims.
- One connector can fail without replacing valid results from another.
- Connector secrets are not returned to the client.

### Follow-up findings

- The function uses `context.supabaseAdmin` for persistence. Ownership checks are performed in code, so this boundary requires dedicated cross-user tests.
- The platform JWT gate is enabled and an unauthenticated request is rejected with HTTP 401 before the handler runs.
- Atomic quotas are active at six runs per minute and 100 per day for the permanent user. The RPC is executable only by `service_role`; `anon` and `authenticated` cannot call it directly.
- Scheduled execution, overlapping-run prevention, and cursor resumption are not implemented yet and remain Phase 4 work.

## Functional action inventory

### Functional today

- Sidebar navigation, collapse, responsive menu, theme toggle, and global search.
- Project creation and local project switching.
- Research and inspiration creation and local search.
- Monitor creation, source configuration, manual runs, monitor deletion, analytics drill-down, mention filters, notes, saves, important marks, and evidence linking.
- RSS/Atom, manual public URL, and official YouTube collection when configured.
- Opening original source links when a real URL exists.

### Clearly unavailable or deferred

- Notifications.
- Research file upload.
- Inspiration advanced filters.
- Database, Authentication, and AI/Privacy settings panels.
- Reddit, Instagram, and TikTok collection.
- Strategy AI model calls.
- Brief generation and export.

### Misleading or incomplete actions to correct in later phases

- The account avatar opens the account and recovery page; a compact account menu remains a later usability improvement.
- Settings detects the connector backend but still labels the Supabase service `Not configured`.
- Connector-row buttons are disabled even for implemented sources; configuration is only available through Radar.
- Project cards link to Home rather than a true project workspace.
- Competitor and brand actions reopen the general project form rather than manage dedicated records.
- Home and Strategy question submission show static framing rather than a real AI response; the labelling is honest, but the interaction should remain clearly non-AI until Phase 6.

## Data retention and deletion expectations

These expectations guide Phase 1 implementation:

- Project deletion must require confirmation and disclose the records that will cascade.
- Archiving should be the default reversible action for projects, insights, briefs, and strategies.
- Permanent deletion must remove database records and associated private Storage objects.
- Monitor deletion may delete collected mentions only after showing the count and downstream evidence relationships.
- Evidence used by an insight, strategy, or brief must show those relationships before deletion.
- Connector run logs should retain status and counts even when source records are archived, unless the whole project is permanently deleted.
- Original evidence text must never be overwritten by generated summaries or user interpretation.
- Users need a complete project export before any irreversible deletion.
- Local migration records should be removed only after verified cloud persistence and a downloadable backup.

## Applied hardening migration

The Supabase CLI created:

`supabase/migrations/20260807145944_phase_0_security_foundation.sql`

It implements:

- private authorization helper plus safe compatibility wrapper
- fixed trigger-function search path
- revoked direct execution on internal helpers
- explicit authenticated policy roles
- statement-initialized `auth.uid()` checks
- non-overlapping project membership policies
- 28 foreign-key indexes
- safer default function privileges

The migration was reviewed, made replay-safe, and applied to the connected project after a logical export. Live verification confirmed:

- all 32 public tables retain RLS
- the public compatibility helper is no longer `SECURITY DEFINER`
- the privileged lookup is isolated in the private schema
- no public-table policy targets the broad `PUBLIC` role
- all 28 planned foreign-key indexes exist
- all pre-existing record counts are unchanged
- Performance Advisor warnings fell from 11 to zero
- an authenticated owner context could read its project, while a different authenticated identity context could read zero projects and update or delete zero rows for the same project ID

The local backup is `work/backups/sift-pre-phase0-20260807.csv` (141,357 bytes, SHA-256 `364079128A499D08B57D6856189ED4B29DBCBA3F5451EF1A74F49B50AB5AE953`). The entire `work` directory is git-ignored and the backup must not be committed or uploaded.

## Phase 0 completion checklist

- [x] Inventory browser storage and map it to database entities.
- [x] Inventory visible product actions and unavailable states.
- [x] Verify live migration history.
- [x] Verify live table counts and preserve existing records.
- [x] Audit RLS coverage, grants, functions, Auth configuration, Storage, and Edge Function boundary.
- [x] Run and record current Security and Performance Advisor findings.
- [x] Define retention and deletion expectations.
- [x] Prepare an additive hardening migration.
- [x] Export a logical backup of current Sift data.
- [x] Apply and verify the hardening migration.
- [x] Run controlled cross-user RLS checks for project select, update, and delete behavior.
- [x] Register the dashboard-applied migration in the remote migration history and verify the complete five-version ledger.
- [x] Decide the Phase 1 permanent sign-in method and anonymous-account migration behavior.
- [x] Enable GitHub OAuth and link the existing workspace without changing its Sift user ID.
- [x] Disable new anonymous sign-ins after verifying the linked GitHub identity.
- [x] Gate private workspace routes behind a verified permanent session.
- [x] Scope browser workspace caches to the authenticated Sift user.
- [x] Transfer project ownership to the permanent GitHub identity and remove unreferenced anonymous Auth users.
- [x] Disable new registrations, anonymous sign-ins, email authentication, and manual identity linking.
- [x] Enable Edge Function JWT verification and verify unauthenticated requests return HTTP 401.
- [x] Add and verify database-backed per-user Radar quotas.

Phase 0 is complete. Phase 1 can now begin from a reproducible, verified backend baseline.

## Current official guidance considered

- Supabase Securing your API: <https://supabase.com/docs/guides/api/securing-your-api>
- Supabase Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Anonymous Sign-Ins: <https://supabase.com/docs/guides/auth/auth-anonymous>
- Supabase Securing Edge Functions: <https://supabase.com/docs/guides/functions/auth>
- Supabase database migration workflow: <https://supabase.com/docs/guides/deployment/database-migrations>
