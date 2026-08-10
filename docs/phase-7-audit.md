# Phase 7 schema and architecture audit

Date: 10 August 2026

Status: **The trusted pipeline foundation and complete evidence-to-proposition review layer are live. The conversational workspace and its integrated, cited manual ChatGPT handoff are implemented without replacing existing sessions or strategic records.**

## Current Insight Builder implementation result

The guided workflow includes **Think → Insight Builder** after Strategy AI. The project-scoped screen can create durable sessions; edit and save Observation, Pattern, Tension, Insight, Opportunity, and Strategic Proposition claims; show stage progress; link original Evidence as support, contradiction, or context; inspect preserved source details; and remove a stage citation without altering the source itself.

Signals and saved Strategy AI assistant messages can be retained as session starting points, but the interface and repository keep them in `strategy_session_inputs`; they never enter `strategy_stage_sources`. This preserves the database distinction between analytical provenance and citable original mentions, Research, or Inspiration. Every saved stage exposes confidence, research gaps, contradictions, alternatives, dependencies, review state, and append-only revisions.

The Strategic Proposition remains visibly locked until an explicit Opportunity has been saved. Saving the proposition idempotently creates its required direct Opportunity dependency. Its reasoning review shows the recursively inherited upstream stage path and unique original-source count without copying evidence. Approval remains database-gated, and an approved proposition receives a focused completion state at the session level.

The static production build, lint, TypeScript check, and full automated suite pass. A read-only live database check confirmed the authenticated session-insert grant and project-scoped create policy are present, while all four first-builder content tables remain at zero rows before the strategist creates real work.

## Conversation-first transition

Real use showed that the formal builder asks the strategist to classify and complete too many small fields before the thinking is mature. Phase 7 therefore changes the default interaction without discarding its trusted data model:

- **Strategy Sessions** becomes the default Think route.
- A session begins with one unfinished question, observation, tension, or situation.
- `strategy_session_turns` preserves gradual strategist input as an append-only timeline.
- The existing staged builder remains available as **Review argument** for evidence, dependencies, uncertainty, approval, alternatives, and revisions.
- Existing `strategy_sessions`, `strategy_stages`, inputs, citations, dependencies, alternatives, and revisions remain authoritative and intact.
- The accepted manual ChatGPT handoff now opens inside the active session. Sift derives a bounded focus from recent strategist turns, retrieves project evidence, and keeps the copy-and-paste boundary explicit.
- A validated response becomes one attributed `chatgpt_manual` turn and optional cited working pieces. These pieces can be dismissed or restored, but remain separate from formal stages until the strategist deliberately shapes them.

The new table is deliberately narrow. Authenticated permanent users can select and insert only inside projects they can access. Browser clients can insert only their own `user` / `strategist` turns; they cannot forge assistant, Sift-guidance, or ChatGPT provenance. Trusted future server paths may add those origins after validation. An atomic `start_strategy_conversation` function creates a session and its first user turn together.

The transition is reproduced by five synchronized migrations: `20260810123220_phase_7_conversational_strategy_turns.sql` adds the turn table and policies, `20260810124457_phase_7_strategy_turn_fk_index.sql` covers the composite session/project relationship and hydration order, `20260810124613_remove_redundant_strategy_turn_index.sql` removes the superseded index, `20260810130647_phase_7_strategy_session_handoff.sql` adds cited working pieces and the service-only idempotent attachment function, and `20260810131616_phase_7_strategy_session_handoff_fk_indexes.sql` covers its standalone foreign-key paths.

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

Use one project-scoped **Strategy Sessions** experience inside Think. It should feel like a continuing working conversation, not a dashboard or compulsory worksheet.

The default screen contains:

1. Project and conversation selectors.
2. One opening prompt that accepts an incomplete thought.
3. An append-only conversation timeline.
4. One transparent, deterministic next-step prompt at a time until the trusted ChatGPT handoff is integrated.
5. Quick actions to add evidence or use the current verified handoff.
6. A compact summary of saved turns, linked original evidence, and formal claims.
7. **Review argument**, which opens the complete existing Observation → Proposition builder and its source drawer, uncertainty, dependencies, approval, and revision history.

Creative territories and briefs remain unavailable until the conversation-first strategy workflow passes acceptance.

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

- **Complete:** Surface confidence and newline-based research gaps inside each saved stage.
- **Complete:** Keep contradicting citations visible and show them before the collapsed reasoning review.
- **Complete:** Connect later claims to earlier saved stages as `builds from`, `qualifies`, or `challenges`.
- **Complete:** Record, revise, retain, or reject alternative interpretations without deleting the reasoning history.
- **Complete:** Expose Draft, Ready, and Approved states with a visible readiness checklist and database-enforced approval requirements.
- **Complete:** Display append-only stage and alternative revisions with before/after snapshots.
- **Complete:** Identify `strategy_stage` relationships correctly in the Evidence library, guarded deletion, and Radar retention explanations.

### Increment 5 - Strategic proposition

- **Complete:** Unlock the proposition only after an explicit saved Opportunity exists.
- **Complete:** Save the proposition through the existing durable stage repository and automatically preserve its required direct Opportunity dependency.
- **Complete:** Apply the same evidence links, confidence, gaps, alternatives, review states, approval checks, and revision history as every earlier stage.
- **Complete:** Display the recursively inherited stage path and unique original-source count without duplicating evidence records.
- **Complete:** Keep the required Opportunity link visible and protected from accidental removal in the interface.
- **Complete:** Show a focused completion state when the proposition is approved.

### Increment 6 - Conversation foundation

- **Complete:** Add append-only, project-scoped session turns with explicit provenance, RLS, grants, and atomic conversation creation.
- **Complete:** Make Strategy Sessions the default Think interface and preserve the staged builder as Review argument.
- **Complete:** Keep deterministic guidance visibly separate from AI analysis.

### Increment 7 - Working pieces and integrated handoff

- **Complete:** Add optional observations, questions, interpretations, tensions, hypotheses, and opportunities without requiring a formal stage.
- **Complete:** Bring validated manual ChatGPT responses into the active session with server-verified provenance and original Evidence citations.
- **Complete:** Add plain-language working-piece labels, source inspection, and reversible dismiss/restore controls.
- **Next:** Let the strategist select useful pieces and explicitly shape them into the existing formal argument.

### Increment 8 - Phase 7 conversational acceptance

- Test one real project through gradual conversation, evidence attachment, handoff import, formal review, and an approved proposition.
- Verify RLS, cross-project rejection, provenance, citation integrity, edit history, deletion protection, refresh persistence, and responsive usability.
- Only after acceptance, begin creative territories and briefs.

## Audit decision

**Reuse the existing foundation; do not replace it and do not create a second Insight system. Make conversation the working layer and the existing pipeline the formal review layer.**

The next implementation action is the remaining Increment 7 step: add an explicit **Shape into argument** action that proposes formal stages from selected pieces without overwriting the conversation, working pieces, or original evidence.
