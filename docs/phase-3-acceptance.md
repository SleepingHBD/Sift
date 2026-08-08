# Phase 3 acceptance checkpoint

Date: 9 August 2026

Application baseline: `3cc90f5`

Database remediation: `20260808160014_optimize_phase_3_evidence_access`

Outcome: **Accepted.** Functional, security, deletion-integrity, scale, and build checks pass.

## Passed

- `107/107` automated tests.
- TypeScript type checking, ESLint, and the production build.
- Authenticated cross-kind search across Radar mentions, Research, and Inspiration.
- Durable review state, strategist notes, and project-scoped strategist topics.
- Preserved source text remains unchanged when strategist notes are edited.
- CSV import retry reuses one import run and does not duplicate an accepted row.
- Insight and brief citations are visible and block evidence deletion until unlinked.
- A cited item can be reconstructed at its original evidence record and URL.
- Different permanent users and anonymous users see zero rows from another project.
- The deployed authenticated UI completed capture, review, note, topic, topic-search, refresh, and cleanup without browser errors.
- All transactional fixtures were rolled back. The one UI fixture and its temporary topic were removed and verified absent.
- Guarded deletion now removes manual strategist-topic assignments before deleting Research or Inspiration evidence.
- RLS continues to return the source to its owner while returning zero rows to another permanent user and an anonymous session.

## Scale result

A rollback-only test inserted 10,000 mentions, requested two keyset pages, and searched for one unique full-text marker. The same fixture and query path were measured before and after the remediation.

- Collection size: `10,000`
- First page plus lookahead: `101`
- Second page plus lookahead: `101`
- Page overlap: `0`
- First page: `81.35 ms` (baseline `4444.88 ms`)
- Second page: `53.02 ms` (baseline `4567.70 ms`)
- Inbox totals: `22.92 ms` (baseline `4313.25 ms`)
- Full-text search: `192.98 ms` (baseline `4784.92 ms`)

Cursor correctness still passes, both pages return the expected `101` rows including lookahead, and the unique full-text marker returns one result. The optimized path is materially below the previous 4.3-4.8 second range and is accepted for the current MVP scale target.

## Remediated defect

`delete_evidence_item` predated `evidence_topic_assignments`. The replacement function now removes matching assignments while the source still exists, allowing the source-matching restrictive RLS policy to authorize the cleanup. A rollback-only live test now confirms `0` source rows and `0` topic assignments after deletion.

The performance remediation adds a private, JWT-derived accessible-project helper and changes the three Evidence source policies to compare indexed `project_id` values against that statement-cached set. It preserves RLS and avoids repeating the same membership lookup for every scanned source row.

Post-remediation checks:

1. Owner visibility: `1` row.
2. Different permanent-user visibility: `0` rows.
3. Anonymous-session visibility: `0` rows.
4. Source rows after guarded deletion: `0`.
5. Topic assignments after guarded deletion: `0`.
6. Rollback fixture residue across projects, mentions, research, and topic assignments: `0`.

## Supabase advisors

- Performance advisor: no active findings other than expected unused-index notices on a new/mostly empty workspace.
- Security advisor: only leaked-password protection is disabled. Password authentication is disabled in Sift's GitHub-only workspace, so this does not affect the active sign-in path. Supabase documents the optional setting in its [password security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Final verification

- Automated tests: `107/107` passed.
- TypeScript: passed.
- ESLint: passed.
- Next.js production build: passed.
- Live migration history and local migration version match at `20260808160014`.

## Post-acceptance clarity correction

A real-use review found that the Evidence detail drawer presented a research item's capture-time `key_findings` as though it were a later strategist note whenever `notes` was empty. The stored data was already separate, so no user records or database columns required migration.

The interface now presents three explicit layers:

1. **Source evidence** — preserved material from the source.
2. **Initial interpretation** — the strategist's capture-time reason for saving it, stored in `research_items.key_findings`.
3. **Working strategist notes** — later, editable analysis stored independently in `research_items.notes`.

Search continues to include all three layers. Regression coverage verifies that later note edits do not replace the initial interpretation.

The same real-use review also exposed a deletion-discoverability gap. Research and Inspiration sources can now open the existing guarded **Delete source** flow directly from their Evidence detail drawer. The dialog rechecks relationships, blocks sources cited by insights or briefs, and removes only permitted user-curated sources. Radar mentions remain unavailable for individual deletion from the project Evidence inbox.

An authenticated local follow-up captured a disposable note, saved an initial interpretation and later working note, classified it, assigned a strategist topic, refreshed, searched both interpretation and notes, and deleted the source through the new drawer action. The inbox now refreshes automatically when Research or Inspiration is added or removed while Evidence is already open. The temporary source and its orphan test topic were removed and verified absent.
