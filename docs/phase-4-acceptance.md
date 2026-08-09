# Phase 4 Radar acceptance record

Date: 9 August 2026

Application baseline: manual acceptance at `ac4dd45`; trusted scheduler deployment at `fbd7c17`

Edge Function baseline: `radar-connectors` version 13 and `radar-scheduler` version 1 with JWT verification enabled

Outcome: **Accepted for manual Radar use; trusted scheduling infrastructure activated and verified.** Phase 4 remains in progress because automatic retention enforcement is deliberately still disabled and a user-configured scheduled connector run still needs real-use observation.

## Accepted scope

- Progressive monitor creation, editing, pausing, source scope, and honest empty states.
- Genuine YouTube, RSS/Atom, and manually supplied URL collection boundaries.
- Independent connector retries, timeouts, diagnostics, and partial-run reporting.
- Database-enforced single-run locking, expiring leases, stale-run recovery, and per-source checkpoints.
- Complete-history headline metrics, timelines, sentiment, topics, keywords, and evidence-linked spikes.
- Cursor-paged conversation search, filtering, sorting, topic drill-down, and direct supporting-record retrieval.
- Explicit analytics coverage and unsupported-source labelling.

## Automated verification

- `127/127` automated tests passed.
- TypeScript type checking passed.
- ESLint passed.
- The Next.js production build passed, including its internal TypeScript check.
- Connector-reliability tests confirm transient-only retries, source timeouts, partial success, deduplication diagnostics, and checkpoint invalidation when a monitor definition changes.
- Analytics tests confirm evidence-linked spikes, supported-driver thresholds, and the absence of unsupported sentiment claims.
- Security configuration tests confirm permanent-account checks, RLS-invoker functions, server-side quotas, one-running-run enforcement, and keyset cursor safeguards.

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
- Retention deletion remains disabled. No activation or verification step deleted conversations or created permanent test records.

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

## Deferred gate

The scheduler infrastructure is active, but individual monitors remain manual until their own daily or weekly schedule is enabled. The next operational checkpoint is observing one user-configured scheduled connector run through the accepted locking, lease, checkpoint, quota, and diagnostic path. The next implementation increment is audited retention enforcement; no deletion worker is active yet.
