# Phase 4 Radar acceptance record

Date: 9 August 2026

Application baseline: manual acceptance at `ac4dd45`; trusted scheduler deployment at `fbd7c17`

Edge Function baseline: `radar-connectors` version 13 and `radar-scheduler` version 2 with JWT verification enabled

Outcome: **Manual Radar, genuine scheduled collection, and audited retention enforcement accepted.** The Phase 4 implementation is complete. The deliberately published retention interface was subsequently confirmed working by the user, so no Phase 4 acceptance item remains open.

## Accepted scope

- Progressive monitor creation, editing, pausing, source scope, and honest empty states.
- Genuine YouTube, RSS/Atom, and manually supplied URL collection boundaries.
- Independent connector retries, timeouts, diagnostics, and partial-run reporting.
- Database-enforced single-run locking, expiring leases, stale-run recovery, and per-source checkpoints.
- Complete-history headline metrics, timelines, sentiment, topics, keywords, and evidence-linked spikes.
- Cursor-paged conversation search, filtering, sorting, topic drill-down, and direct supporting-record retrieval.
- Explicit analytics coverage and unsupported-source labelling.
- Trusted daily and weekly scheduling with Vault-authenticated dispatch and per-source checkpoints.
- Explicitly opted-in, bounded retention with protected evidence and content-free audits.

## Automated verification

- `131/131` automated tests passed.
- TypeScript type checking passed.
- ESLint passed.
- The Next.js production build passed, including its internal TypeScript check.
- Connector-reliability tests confirm transient-only retries, source timeouts, partial success, deduplication diagnostics, and checkpoint invalidation when a monitor definition changes.
- Analytics tests confirm evidence-linked spikes, supported-driver thresholds, and the absence of unsupported sentiment claims.
- Security configuration tests confirm permanent-account checks, RLS-invoker functions, server-side quotas, one-running-run enforcement, and keyset cursor safeguards.
- Retention regression tests confirm default opt-out, service-role-only enforcement, the 250-record scheduler batch, protected relationship classification, RLS audit access, and the independent scheduler error path.

The first standalone type-check was started concurrently with the production build and briefly read a regenerating `.next` route file. It passed immediately when rerun after the build and is not an application defect.

## Complete-history and scale evidence

The pagination increment passed its rollback-only live database verification before this checkpoint:

- Cursor page returned its requested rows plus one lookahead row.
- The following page had zero record overlap.
- Search and topic filters returned only matching records.
- Direct supporting-record lookup returned the requested authorized mentions.
- A 10,000-record fixture completed the cursor query path in approximately `226 ms`.
- Owner access succeeded, while a different permanent account and an anonymous session were denied.
- The temporary fixture was removed and verified at zero residue.

An authenticated populated UI check also expanded the visible conversation set from `24` to `30` records and returned `18` matching search results without replacing the current page or losing the active monitor context.

## Deployed real-use check

The production workspace was intentionally blank at the start of this checkpoint, so the deployed check exercised the new-user path without inserting synthetic analytics:

1. Created `Phase 4 acceptance checkpoint conversation` in the signed-in private workspace.
2. Confirmed the monitor began with no conversations and exposed one genuinely ready source.
3. Ran the monitor through the deployed JWT-protected Edge Function.
4. Received a successful genuine-source run with zero matching records.
5. Confirmed the interface reported `All sources completed` and `No conversations matched this monitor` rather than showing fabricated analytics.
6. Reloaded the deployed page and confirmed the monitor and run diagnostics hydrated from Supabase.
7. Deleted the temporary monitor through the guarded interface.
8. Verified `0` temporary monitors, `0` orphan runs, and `0` total monitors remained in PostgreSQL.

The corresponding version 12 Edge Function requests returned HTTP `200` in production logs.

## Supabase state

- Live migration history includes the monitor lease, summary, analysis, conversation pagination, topic index, and redundant-index cleanup migrations.
- `radar-connectors` version 12 is active and requires a valid JWT.
- Security advisor: only leaked-password protection is disabled. Sift uses GitHub OAuth rather than password authentication, so this does not affect the active sign-in path. Supabase documents the optional setting in its [password security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Performance advisor: informational unused-index notices only. No new Radar index warning requires remediation at the current workspace scale.

## Production scheduler activation

The trusted scheduler was explicitly approved and activated on 9 August 2026:

- Three named scheduler values are stored in Supabase Vault; no service-role key is stored in Vault, the client, or the cron command.
- `sift-radar-scheduler` is active in `pg_cron` on the one-minute dispatcher schedule.
- An automatic cron invocation completed successfully and its `pg_net` request received HTTP `200` with `claimed: 0`, which was correct because no monitor was enabled for automatic collection.
- A rollback-only database test created one temporary due monitor, atomically claimed it, finalized it successfully, advanced its next scheduled run, and left no persistent fixture.
- The first controlled activation exposed two dormant SQL defects: an unsupported `GROUP BY true` completeness check and a PL/pgSQL variable named `current_time` conflicting with the SQL keyword. The activation transaction rolled back before secrets or jobs were created, both issues were corrected through the follow-up `fix_trusted_radar_scheduler_activation` migration, and the clean automatic dispatch was then reverified.
- Scheduler activation did not enable retention or delete conversations. The later retention deployment also left every monitor opted out by default.

## Genuine scheduled-run check

The user-configured `RDC` monitor completed its scheduled YouTube run at 18:00 Singapore time on 9 August 2026:

- The trusted cron path claimed and completed the monitor in approximately three seconds.
- YouTube returned and persisted 21 genuine records.
- Zero duplicate records were created.
- The connector checkpoint advanced incrementally.
- The monitor calculated its next daily occurrence and recorded no schedule error.

This completed the deferred operational gate without a manual connector request.

## Audited retention checkpoint

- Migration `phase_4_audited_radar_retention` is recorded in production.
- All existing and new monitors default to `retention_enabled = false`; the live workspace had zero enabled retention policies after deployment.
- Only `service_role` can execute `enforce_radar_retention`; anonymous and authenticated browser roles cannot execute it.
- `radar_retention_runs` has Row Level Security enabled. Permanent authenticated accounts can read only audits for projects they may access, while anonymous access is revoked.
- Scheduler version 2 calls retention only after a successful scheduled collection. A retention failure is isolated from collection success.
- One retention call can delete no more than 250 eligible conversations.
- A rollback-only production-database test exercised default opt-out, two bounded batches, nine protection routes, two completed audits, and deletion of only the two eligible fixture conversations.
- Important, reviewed, noted, saved, tagged, strategist-topic-linked, insight-cited, brief-cited, and trend-linked fixture conversations all remained intact.
- The rollback verification found zero fixture projects, monitors, sources, conversations, or audits afterward.
- After the Edge Function deployment, the active cron dispatch returned HTTP `200` with `claimed: 0`, which was correct for the blank live workspace.

## Acceptance criteria result

| Criterion | Result |
| --- | --- |
| Every metric names or exposes its coverage | Passed |
| One connector can fail without erasing successful source results | Passed through deterministic reliability tests and independent result persistence |
| Re-running cannot duplicate an identical source record | Passed through normalized identity tests and the database `(source_id, external_id)` constraint |
| A spike links to supporting records | Passed |
| A likely driver requires the configured evidence threshold | Passed |
| Insufficient evidence produces no asserted driver | Passed |
| Unsupported sources cannot be enabled or mistaken for live collection | Passed |
| Conversation pages remain stable and RLS-scoped | Passed |
| The deployed blank and zero-result states remain honest | Passed |
| A genuine user-configured scheduled run completes and advances its checkpoint | Passed |
| Retention is explicit, bounded, audited, and protects strategic evidence | Passed through live rollback-only verification |

## Remaining interface confirmation

The backend checkpoint is complete. The local monitor editor now exposes the separate **Enable automatic retention** checkbox only for a saved, active, scheduled monitor with a finite retention window. Because website publication requires an explicit user instruction, the remaining step is to publish these local interface changes and confirm that the checkbox, preview, protection copy, and automatic disable behaviour render correctly on the deployed site. Retention remains off until deliberately enabled on an individual monitor.
