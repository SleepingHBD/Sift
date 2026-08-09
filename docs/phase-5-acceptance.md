# Phase 5 Signals acceptance record

Date: 9 August 2026

Application baseline: `b025842`

Outcome: **Accepted and complete.** Automated, live-database, deployed, and strategist real-use checks passed.

## Accepted scope

- Project-scoped working Signals that remain analytically separate from promoted Trends.
- Manual candidate and hypothesis capture, watching, dismissal, and annotation.
- Explicit support, contradiction, and context relationships to original project evidence.
- Transparent deterministic assessments with evidence sufficiency, source and author diversity, contradiction handling, limitations, research gaps, and immutable snapshots.
- Revision-preserving claim, note, and topic corrections.
- Provenance-safe merge and split operations with immutable lineage.
- Database-enforced promotion into a separate observed Trend only after the current assessment satisfies every evidence threshold.
- Locked evidence relationships for superseded or promoted Signals.

## Automated verification

- `143/143` automated tests passed.
- TypeScript type checking passed.
- ESLint passed.
- The Next.js production build passed, including its internal type check.
- Signal regression tests cover assessment transparency, evidence classification, unavailable growth, correction history, lineage, promotion requirements, and repository failure states.

## Live database verification

Rollback-only transactions were run against the production Supabase schema. They verified:

- correction revisions preserve before and after states;
- topic reassignment creates a separate auditable revision;
- a browser session cannot forge revision or lineage records;
- merge preserves the target, dismisses and supersedes the source, transfers evidence, and records lineage;
- split moves selected evidence into a child Signal and records lineage;
- evidence on a superseded Signal cannot be altered or removed;
- a contradiction-heavy candidate cannot be promoted;
- a current sufficient assessment with six supporting sources, three source origins, and six distinct authors can be promoted;
- promotion creates a separate observed Trend linked to the exact Signal and assessment;
- evidence on a promoted Signal cannot be altered or removed;
- another permanent account and an anonymous session cannot read, mutate, or promote the owner's Signal.

Every transaction rolled back. Follow-up residue checks returned zero temporary Signals, Research items, and topics.

## Deployed UI verification

The signed-in GitHub Pages application was exercised against the live private workspace:

1. The blank Signals state rendered without synthetic claims or metrics.
2. Two temporary candidates and one temporary Research source were created.
3. A claim correction, observation correction, strategist note, and new topic were saved.
4. Reloading confirmed the corrected authoritative row and its immutable correction history.
5. The merge workflow displayed the eligible source Signal, its evidence count, deliberate selection, and enabled merge action.
6. Promotion review opened and clearly blocked promotion of the evidence-free target, naming the missing current assessment, six supporting sources, three source origins, and contradiction threshold.
7. All temporary Signals, evidence relationships, revisions, Research material, and the temporary topic were removed.
8. The deployed workspace returned to `No signals recorded yet.`

The browser harness could render and select the merge workflow but timed out while dispatching its final merge click. The same atomic merge and split paths passed live rollback-only database tests. A short hands-on interaction is therefore retained as the final acceptance item rather than treating browser automation as strategist approval.

## Supabase state

- Production migration history contains `phase_5_signal_foundation`, `phase_5_signal_corrections_and_promotion`, and `harden_signal_operation_rpc_boundary`.
- Row Level Security and explicit grants protect Signals, evidence links, snapshots, revisions, and lineage.
- Security advisor: leaked-password protection is disabled. Sift uses GitHub OAuth and does not enable password sign-in, so this does not affect the active authentication path. Supabase documents the optional control in its [password security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Performance advisor: informational unused-index notices only; no Phase 5 warning requires a schema change at the current workspace scale.

## Acceptance criteria result

| Criterion | Result |
| --- | --- |
| Every Signal opens into its linked supporting and contradicting evidence | Passed through automated, live database, and deployed detail checks |
| Topic correction preserves original source content | Passed |
| Reprocessing and correction remain auditable | Passed through immutable snapshots and revisions |
| Narrow or contradictory evidence cannot create unwarranted strength | Passed |
| No limited observed sample becomes a global trend claim | Passed through scope labels and promotion gates |
| Merge and split preserve provenance | Passed through live rollback-only verification; final hands-on interaction pending |
| Promotion is explicit, current, and evidence-gated | Passed |
| Cross-account and anonymous access is denied | Passed |

## Strategist confirmation

On 10 August 2026, the strategist exercised the deployed Signals workflow with a real working observation, inspected the evidence trail, and confirmed the workflow after asking what each layer was for. A guarded permanent deletion flow was added for disposable standalone candidates, verified against the live database and authenticated UI, and deployed before final confirmation. Original Radar, Research, and Inspiration records remain preserved when such a candidate is removed.

The confirmed workflow was:

1. Record a candidate using a claim you genuinely want to investigate.
2. Connect at least one real project source and classify it as support, contradiction, or context.
3. Add a rationale, create an assessment, and confirm the limitations and research gaps are useful and understandable.
4. Correct the claim or topic once and confirm the earlier version remains visible in history.
5. Optionally merge a disposable second candidate into it, or split one linked source into a child Signal, then inspect the lineage explanation.
6. Confirm that promotion stays blocked while the evidence requirements are unmet.

The strategist completed the hands-on checkpoint and removed disposable test material. Phase 6 may proceed without weakening the evidence, correction, or promotion boundaries accepted here.
