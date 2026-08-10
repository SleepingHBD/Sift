# Phase 7 schema and architecture audit

Date: 10 August 2026

Status: **Increments 1 through 3 implemented. The trusted pipeline foundation is live and the first Insight Builder is complete locally; no Phase 7 content was seeded during verification.**

## Increment 3 implementation result

The guided workflow now includes **Think → Insight Builder** after Strategy AI. The project-scoped screen can create durable sessions, edit and save Observation, Pattern, Tension, Insight, and Opportunity claims, show stage progress, link original Evidence as support, contradiction, or context, inspect preserved source details, and remove a stage citation without altering the source itself.

Signals and saved Strategy AI assistant messages can be retained as session starting points, but the interface and repository keep them in `strategy_session_inputs`; they never enter `strategy_stage_sources`. This preserves the database distinction between analytical provenance and citable original mentions, Research, or Inspiration. The Strategic Proposition is visibly locked. Confidence, research gaps, alternatives, dependencies, approval state, and revisions remain the next explicit uncertainty-and-traceability increment rather than being implied as complete.

The static production build, lint, TypeScript check, and full automated suite pass. A read-only live database check confirmed the authenticated session-insert grant and project-scoped create policy are present, while all four first-builder content tables remain at zero rows before the strategist creates real work.

## Increment 2 implementation result

The audit decision has now been implemented in two additive migrations:

- `20260810091104_phase_7_strategy_pipeline_foundation.sql` hardens the existing session and stage records and adds normalized inputs, evidence citations, dependencies, retained alternatives, approval state, and append-only revisions.
- `20260810172826_phase_7_strategy_pipeline_fk_indexes.sql` covers every new foreign-key access path in the order reported by the Supabase performance advisor.

All new public tables use explicit Data API grants, project-scoped RLS, and a restrictive permanent-account policy. AI messages and Signals are derivation provenance only; original mention, Research, and Inspiration records remain the only stage evidence kinds. Workspace-backed observations and insights cannot be approved without supporting evidence, later stages require an explicit dependency, and a strategic proposition requires a saved Opportunity plus a direct dependency on it. Material edits demote an approved stage and create an immutable revision.

The live database contract was tested inside an authenticated transaction and rolled back. The verification created temporary Research evidence, approved an evidence-backed Observation, confirmed an unsupported Pattern was rejected, added a dependency, approved and corrected the Pattern, confirmed revision history, and confirmed that cited evidence could not be deleted. Persisted counts remained zero for all Phase 7 content tables, while the existing 3 Strategy AI conversations and 6 messages were preserved. The Supabase advisor reports no unindexed foreign keys after the follow-up migration.

## Purpose

Phase 7 must turn evidence into an editable strategic argument:

```text
Evidence / Signal / saved Strategy AI analysis
  -> Observation
  -> Pattern
  -> Tension
  -> Insight
  -> Opportunity
  -> Strategic proposition
  -> Creative territories
  -> Brief
```

This audit checks whether the existing schema can support that path without creating a second strategy system or weakening the evidence trail.

## What was inspected

- Every local migration through `phase_6_strategy_ai_budget_guardrails`.
- The generated Supabase database types and the current repositories and pages that use Evidence, Signals, Strategy AI, Trends, and Briefs.
- The live `Signal` Supabase project, using read-only catalog queries for columns, constraints, indexes, grants, Row Level Security policies, and row counts.
- The applied live migration list and current Supabase security and performance advisors.
- Current Supabase guidance for [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Data API grants](https://supabase.com/docs/guides/api/securing-your-api), and [breaking changes](https://supabase.com/changelog?types=breaking-change).

## Current live state

The local and live schemas agree on the Phase 7 foundation. The remote migration names are present through Phase 6; several remote version timestamps differ from their local filenames because they were assigned when the migrations were applied, but the named sequence and inspected live objects are aligned.

The live tables contain:

| Area | Live rows | Meaning for Phase 7 |
| --- | ---: | --- |
| `ai_conversations` / `ai_messages` | 3 / 6 | Existing accepted Strategy AI work must be preserved and may become an optional pipeline input. |
| `insights` / `insight_sources` | 0 / 0 | Safe to strengthen before the first insight is created. |
| `strategy_sessions` / `strategy_stages` | 0 / 0 | Safe to evolve into the working strategy pipeline. |
| `creative_territories` | 0 | Keep dormant until the insight pipeline passes acceptance. |
| `briefs` / `brief_sources` | 0 / 0 | Keep dormant until territories and on-screen briefs are reliable. |
| `signals` / `signal_evidence` | 0 / 0 | The implemented Signal contract is reusable even though this workspace currently has no Signal records. |

All inspected public tables have RLS enabled. `anon` has no table grants. The permanent-account policy is restrictive, and project access policies are permissive within that boundary. The two AI tables are browser-readable but not browser-writable; validated assistant output remains service-written.

The security advisor reports one existing warning that leaked-password protection is disabled and one informational item for an intentionally private RLS table without policies. Neither was introduced by Phase 7, and neither blocks this schema design. Because production authentication currently uses GitHub OAuth rather than Supabase password sign-in, the password warning is not part of the active sign-in path. The performance advisor mostly reports unused indexes on features with little or no data; no indexes should be removed on that evidence alone.

## What can be reused

### `strategy_sessions`

Use this as the project-scoped container for one strategic line of reasoning. Its existing title, project, creator, status, source scope, and timestamps are the correct aggregate boundary.

### `strategy_stages`

Use this as the current editable projection of each stage. The existing stage values already cover observation, pattern, tension, insight, opportunity, and strategic proposition. The existing `claim_type` enum already distinguishes evidence, interpretation, hypothesis, and recommendation.

### `signals`, `signal_evidence`, and `signal_snapshots`

Reuse Signals as an optional starting point, not as a duplicate Insight. Signals remain provisional observations or hypotheses with support, contradiction, scope, movement, and immutable assessments. A pipeline may cite a Signal as analytical provenance while retaining the Signal's original evidence links.

### `ai_conversations` and `ai_messages`

Reuse a saved assistant message as optional derivation provenance. It is not evidence by itself. The original mention, Research, and Inspiration identities cited by the AI response remain the evidence that supports a workspace-backed stage.

### `insights` and `insight_sources`

Keep these as the durable, approved Insight Library projection after a pipeline has matured. Do not write a second copy on every keystroke. When an insight is published from a session, preserve the session link and consolidate its source evidence into `insight_sources`.

### `creative_territories`, `briefs`, and their source tables

Keep these for later Phase 7 increments. They should consume an accepted pipeline; they should not drive the first builder migration.

## Gaps that must be closed

### 1. No stage-level evidence relationship

`strategy_sessions.source_scope` is JSON and `strategy_stages` has no normalized source table. It cannot currently answer, "Which exact sources support or contradict this observation?"

Add a project-scoped `strategy_stage_sources` relation. Restrict original evidence kinds to mention, Research, and Inspiration. Record `support`, `contradict`, or `context`, plus an optional excerpt and rationale. Validate every polymorphic source against the stage's project in both RLS and a write-time function or trigger.

### 2. Signals and AI analyses need provenance, not evidence status

The existing `item_kind` enum does not contain Signal or AI message, and extending it would blur original evidence with derived analysis.

Add a separate `strategy_session_inputs` relation for `signal` and `ai_message`. This records where the strategist started. When an input is used in a stage, also attach its underlying original evidence to `strategy_stage_sources`. The UI must label AI material as analysis or interpretation, never as a factual source.

### 3. No dependency chain between stages

Later stages cannot currently state which earlier claims they depend on.

Add `strategy_stage_dependencies` with same-session validation and a small relationship vocabulary such as `derives_from`, `qualifies`, and `challenges`. Reject self-links and cycles. This is the trace from pattern to tension to insight to opportunity.

### 4. No approval, confidence, gaps, or contradiction state

The stage row has content and claim type only.

Extend the stage projection with:

- `status`: draft, ready, or approved;
- `confidence`: low, medium, or high;
- `research_gaps`: an empty-by-default text array;
- optional `approval_note`, `approved_at`, and `approved_by`;
- a bounded, positive position value.

Confidence describes the strength of the strategic claim, not objective certainty. A stage with unresolved contradiction may still be saved, but the contradiction and resulting limitation must remain visible.

### 5. Alternatives would currently be overwritten

The unique `(session_id, stage)` constraint permits only one current stage and offers no place for a competing interpretation.

Keep one selected stage projection and add `strategy_stage_alternatives`. Each alternative retains content, claim type, confidence, status, rationale, and its own evidence relationships. Rejecting an alternative changes its status; it does not delete the record.

### 6. No version history

Direct edits currently replace stage content.

Add append-only `strategy_stage_revisions`. A database trigger should snapshot the old row before a material update or delete so history cannot depend on a cooperative browser. Authenticated users may read revisions but not update or delete them directly.

### 7. Existing polymorphic source integrity is too weak

`insight_sources` and `brief_sources` authorize through their parent rows but do not currently prove that `source_id` exists in the same project. The original schema explicitly delegated this to application services.

Before Phase 7 writes either table, add the same database-side source-existence and immutable-identity checks already used by `signal_evidence`. This also protects against accidental cross-project citations.

### 8. Existing parent links do not guarantee project consistency

`creative_territories.project_id`, `strategy_session_id`, and `insight_id` use independent foreign keys. A malformed write could connect records from different projects. The same concern applies to the future session-to-published-insight link.

Use composite project-scoped foreign keys or guarded write functions before those outputs become writable in the UI.

### 9. Creator fields need safer defaults and immutability

`insights`, `strategy_sessions`, and `briefs` require `created_by` but do not default it to `auth.uid()`. Their project RLS policies do not make the creator immutable.

Derive creator identity in the database, verify it on insert, and reject ownership changes on update. Continue to require a permanent authenticated account.

## Recommended model

```text
project
  -> strategy_session
       -> session_inputs (Signal or saved AI analysis; provenance only)
       -> strategy_stages (one selected current row per stage)
            -> stage_sources (original evidence, with support/contradict/context)
            -> stage_dependencies (earlier stage claims)
            -> stage_alternatives (retained competing readings)
            -> stage_revisions (append-only history)
       -> approved insight snapshot
            -> insight_sources
       -> strategic proposition
       -> creative territories
       -> brief + source appendix
```

The source record always stays authoritative. Editing a stage, alternative, territory, or brief never edits a mention, Research item, Inspiration item, Signal, or AI message.

## Security and API rules for the migration

- Enable RLS explicitly on every new public table.
- Revoke `public` and `anon`; grant only the exact operations needed by `authenticated` and `service_role`.
- Use separate operation-specific policies where ownership rules differ.
- Require accessible project IDs and permanent users in every policy.
- Validate source existence and same-project identity on both insert and update.
- Make creator, project, session, stage, and source identity columns immutable after insert.
- Make revisions append-only to authenticated clients.
- Prefer `security invoker`; if a narrowly scoped `security definer` operation is unavoidable, use an empty `search_path`, revoke public execution, validate the caller and project explicitly, and grant only its exact signature.
- Add indexes for project/session lists, stage order, dependency lookup, and reverse source lookup. Keep foreign-key indexes explicit.
- Do not rely on platform default Data API exposure. State grants in the migration, because current Supabase projects do not automatically expose every new table.

## UI boundary

Add one project-scoped **Insight Builder** inside the existing Think step. It should not be a dashboard of disconnected cards.

The first usable screen should contain:

1. Project and session selector.
2. Optional starting inputs: selected Evidence, a Signal, or a saved Strategy AI analysis.
3. A vertical editable sequence: Observation, Pattern, Tension, Insight, Opportunity.
4. For each stage: claim classification, confidence, supporting and contradicting evidence, research gaps, alternatives, dependency trail, and approval state.
5. A source drawer that opens the original evidence.
6. Autosave with an explicit saved/error state and revision history.

The strategic proposition remains locked until the opportunity contains an explicit saved claim. Creative territories and briefs remain unavailable from this screen until the insight-pipeline acceptance checkpoint passes.

## Incremental implementation plan

### Increment 2 - Trusted pipeline foundation

- **Complete:** Harden `strategy_sessions` and `strategy_stages`.
- **Complete:** Add session inputs and stage evidence relationships.
- **Complete:** Add RLS, grants, validation triggers/functions, indexes, and database tests.
- **Complete:** Regenerate TypeScript database types.

### Increment 3 - First Insight Builder

- **Complete:** Add the project-scoped route, repository, types, loading/error/empty states, and session creation.
- **Complete:** Start from hand-selected Evidence, Signal, or saved Strategy AI analysis while separating evidence from provenance.
- **Complete:** Implement editable Observation through Opportunity with visible source links and an original-source drawer.

### Increment 4 - Uncertainty and traceability

- Surface and exercise the implemented dependencies, alternatives, confidence, gaps, contradictions, approval, and immutable revisions.
- Show the implemented blocking stage-citation relationship in guarded evidence deletion and Radar retention explanations.

### Increment 5 - Strategic proposition

- Unlock the proposition only after an explicit Opportunity exists.
- Preserve the full dependency and evidence trail.

### Increment 6 - Phase 7 pipeline acceptance

- Test one real project from source evidence through an approved proposition.
- Verify RLS, cross-project rejection, citation integrity, edit history, deletion protection, refresh persistence, and responsive usability.
- Only after acceptance, begin creative territories and briefs.

## Audit decision

**Reuse the existing foundation; do not replace it and do not create a second Insight system.**

The next implementation action is Increment 4: surface and exercise confidence, research gaps, contradictions, alternatives, dependencies, approval state, and append-only revisions in the existing Insight Builder.
