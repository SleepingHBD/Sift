# Sift development roadmap

## Product outcome

Sift should become a personal evidence intelligence workspace for a creative strategist. Its job is to make this path reliable:

```text
question -> collect and capture -> review evidence -> find patterns
         -> form an insight -> identify an opportunity -> develop creative direction
```

Sift is not required to observe the whole internet. It is required to be explicit about what it observed, preserve the original evidence, and help turn that evidence into better strategic decisions.

## Product principles

1. Evidence precedes interpretation.
2. Every workspace-backed claim must link to its supporting source material.
3. Measured data, interpretation, hypothesis, and recommendation must be visibly different.
4. Coverage must be described accurately. Sift reports activity within observed sources, not universal market truth.
5. Automated collection, strategist-captured material, and imported research are equally valid inputs when their provenance is clear.
6. Capturing useful material should take seconds, not require a long form.
7. Empty or inconclusive evidence is an acceptable result. Sift must never fill a gap with fabricated findings.
8. No source is labelled live unless it retrieves genuine records through a permitted interface.
9. A feature is complete only when it persists, handles errors, is testable, and participates in the evidence trail.
10. Publishing, scheduling, community management, and vanity analytics remain outside the product boundary.

## Current baseline

### Already implemented and reusable

- Static Next.js application shell, responsive navigation, themes, and blank-slate pages.
- Cloud creation and hydration of projects, research items, inspiration items, and Radar monitors.
- Radar overview, topics, spikes, mentions, detail, filters, notes, saves, and evidence interactions.
- Deterministic sentiment, keyword, topic, growth, and spike-processing utilities with tests.
- Normalized connector contracts.
- Genuine RSS/Atom, manual public URL, and official YouTube connector runtime.
- Authenticated Supabase Edge Function boundary for connector execution.
- PostgreSQL schema for projects, sources, monitors, mentions, topics, research, inspiration, insights, strategy, briefs, conversations, and evidence relationships.
- Row Level Security policies and full-text indexes.
- GitHub Pages deployment with private credentials kept outside the static client.

### Current limitations to resolve first

- Phase 1 is complete: the permanent GitHub identity and cloud-first workspace passed refresh, sign-out privacy, second-browser hydration, reviewed browser migration, idempotency, and failed-write acceptance checks.
- Theme, connector settings, active-project selection, and other harmless interface preferences remain browser-local by design.
- GitHub is the only enabled sign-in method. Workspace ownership has been transferred to that permanent identity; obsolete anonymous users and sessions have been removed.
- Private routes require a verified permanent session and the implemented Phase 1 domains now hydrate from Supabase.
- Research supports rich provenance, authenticated URL extraction, private screenshots/documents, social capture, and bounded CSV import; richer automatic document processing remains deferred.
- Strategy AI now has a JWT-protected, RLS-scoped evidence preview, a visible manual ChatGPT handoff, response validation, and durable cited conversations; real-use acceptance remains.
- Polymorphic evidence relationships use guarded database operations and project checks; future relationship types must preserve those integrity rules.
- Radar conversations and the unified Evidence Inbox use server-side filtering and stable cursor pagination; broader retrieval evaluation remains Phase 6 work.
- Database ownership, RLS, client grants, Auth providers, and the Radar Edge Function have completed the Phase 0 security audit; repository-level least privilege remains part of the cloud hydration work.

## Target architecture

```text
Next.js static client on GitHub Pages
  |
  |-- Supabase Auth: permanent user identity
  |-- Supabase Data API: RLS-scoped workspace reads and writes
  |-- Supabase Storage: screenshots, documents, and capture assets
  |-- Supabase Edge Functions
        |-- connector execution
        |-- safe URL extraction
        |-- import processing
        |-- evidence retrieval
        |-- AI analysis and generation
        `-- scheduled monitor orchestration

Permitted connectors + strategist capture + file/CSV import
  -> normalized source records
  -> review inbox
  -> topics and signals
  -> cited insights
  -> strategy pipeline
  -> territories and briefs
```

The client should depend on repository interfaces rather than calling `localStorage` or Supabase throughout page components. Initial repositories will use Supabase. A small local cache may later support resilience, but it must not become a second source of truth.

## Evidence model direction

The existing domain tables should be preserved:

- `mentions` for connector and captured conversation records.
- `research_items` for articles, reports, statistics, quotes, notes, and documents.
- `inspiration_items` for creative references and visual material.
- `insight_sources` and `brief_sources` for citations.
- `saved_items` for user actions and destinations.

The application should introduce a shared TypeScript `EvidenceReference` union over these tables rather than immediately replacing them with one large generic table. Retrieval services can return one normalized evidence shape while the database retains type-specific fields and foreign keys.

Before adding a universal evidence registry, test whether the typed union plus explicit relationship tables meets the real workflow. If a registry becomes necessary, add it through an additive migration and backfill; do not rewrite working source tables.

Every retrievable evidence record should expose:

- stable ID and project ID
- evidence kind and capture method
- original URL and source
- title or author where available
- original content or excerpt
- publication and capture timestamps
- connector or import run ID where applicable
- notes and strategist annotations
- tags, topics, language, and processing status
- attachment or screenshot references
- provenance metadata and content hash
- review status: `unreviewed`, `relevant`, `irrelevant`, or `archived`

## Release gates

| Gate | Outcome | Phases required |
| --- | --- | --- |
| Foundation reliable | The same private workspace loads after refresh and on another signed-in device. | 0-1 |
| Research usable | Sources can be captured, imported, reviewed, searched, and reused as evidence. | 2-3 |
| Radar useful | Permitted sources produce transparent, explorable observed-conversation intelligence. | 4 |
| Strategist useful | Sift can form inspectable signals and answer questions using cited workspace evidence. | 5-6 |
| End-to-end useful | An evidence-backed insight can become a strategy pipeline, territory, and brief. | 7 |
| Daily-driver reliable | Monitoring, capture, backups, usage controls, and diagnostics work without supervision. | 8 |

## Phase 0 - Architecture and data safety audit

Status: **Complete.** The repository and live backend audit is documented in [phase-0-audit.md](phase-0-audit.md). Additive hardening migrations are backed up, applied, and verified without changing domain record counts; controlled cross-user RLS checks pass; the workspace is owned by the sole permanent GitHub identity; private routes plus browser caches are scoped to that identity; and every Phase 0 migration is recorded in the live Supabase migration history.

### Goal

Freeze the new product boundary and verify the existing backend before moving more application state into it.

### Work

- Inventory every browser storage key and map it to its intended database table.
- Inventory every button and classify it as functional, intentionally unavailable, or removable.
- Verify which migrations are applied to the connected Supabase project.
- Audit table grants, RLS coverage, ownership checks, Storage policies, Edge Function authentication, and service-role usage.
- Move privileged authorization helpers out of the exposed `public` schema where appropriate, explicitly restrict execution, and ensure each check includes the caller identity.
- Replace repeated `auth.uid()` calls in large RLS paths with performance-safe patterns where applicable.
- Identify and add missing indexes on foreign keys and RLS predicates.
- Verify cascade and restrict behavior before enabling destructive project and monitor actions.
- Document data retention, deletion, and export expectations.
- Capture a database backup before the first migration in Phase 1.

### Deliverables

- Current-state data map.
- Security and RLS audit checklist with resolved findings.
- Additive migration plan.
- Repository boundary design.
- Agreed vocabulary for evidence, signal, observed trend, interpretation, and hypothesis.

### Acceptance criteria

- No client or function can access another user's project by substituting an ID.
- No private API or service-role key appears in the static bundle.
- Every exposed table has an explicit access decision.
- Schema changes can be reproduced from committed migrations.
- Existing user-created records remain intact.

## Phase 1 - Permanent identity and cloud workspace

Status: **Complete.** The cloud-first workspace and its acceptance evidence are documented in [phase-1-acceptance.md](phase-1-acceptance.md). The same private Radar workspace hydrated in a second signed-in browser, signing out removed private UI state, controlled write failures retained unsaved input, and reviewed browser migration preserved the 92 genuine connector records without duplicate mentions.

### Goal

Make Supabase the durable source of truth and remove browser storage as the primary database.

### Current implementation status

- Completed: authenticated project repository, cloud hydration, create, edit, archive, restore, permanent delete, relational brand/competitor context, database-derived project counts, and explicit loading/error states.
- Completed: reviewed browser-project migration with preview, downloadable backup, idempotent client references, verified cleanup, and manual retry.
- Completed: Research and Inspiration cloud repositories, authenticated hydration and creation, project assignment, deletion, loading/error states, and reviewed idempotent browser-data imports with backups.
- Completed: Radar monitor creation and deletion, connector-created mention/run hydration, normalized topic/source mapping, bounded keyset reads, honest loading/error/truncation states, and reviewed idempotent browser-data import with backup.
- Completed: authenticated per-user Radar notes, saved markers, important marks, and evidence relationships, including reviewed browser-data migration and explicit write failures.
- Completed checkpoint: the full Phase 1 acceptance sequence passed across refresh, local sign-out privacy, re-authentication, a second signed-in browser, reviewed migration, retry safety, loading and empty states, and controlled failed writes.

### Work

#### Authentication

- Add a first-party sign-in page inside Sift.
- Keep GitHub as the sole supported production provider and keep new registrations disabled after the personal account is provisioned.
- Add sign-out, session-expired, auth-loading, and recovery states.
- Configure production and local redirect URLs.
- Preserve the completed ownership transfer and reject any retired anonymous token that remains in an old browser cache.

#### Repository layer

- Create repositories for projects, research, inspiration, monitors, mentions, notes, saves, and evidence links.
- Keep Supabase queries outside presentation components.
- Add consistent result, error, loading, and pagination types.
- Add project-scoped query helpers that never rely on a client-supplied owner ID.

#### Cloud hydration and writes

- Load the signed-in user's projects from Supabase.
- Create, update, archive, and delete projects in Supabase.
- Load and persist research, inspiration, monitors, notes, saves, and important marks.
- Read connector-created mentions and run history back from Supabase.
- Replace local counters with database-derived counts.
- Retain only theme and harmless UI preferences locally.

#### Browser-data migration

- Detect existing Sift storage records.
- Preview what will be imported.
- Import idempotently using stable client references or content hashes.
- Confirm the cloud write before removing a local record.
- Offer a downloadable backup and a manual retry path.

### Database work

- Prefer additive columns and backfills over table replacement.
- Add indexes for project-scoped sort and cursor pagination paths.
- Add unique constraints needed for idempotent import.
- Review the broad table grants and reduce privileges where practical while preserving RLS enforcement.
- Add audit fields only where they support troubleshooting or provenance.

### Acceptance criteria

- A signed-in user creates a project, refreshes, and sees the same project.
- The same workspace appears on a second signed-in browser.
- Signing out reveals no cached private workspace content.
- Imported browser data is not duplicated when the migration is retried.
- Connector records are read from the cloud after local storage is cleared.
- Empty, loading, permission, offline, and failed-write states are distinguishable.

## Phase 2 - Fast evidence capture

Status: **Complete.** The shared TypeScript `EvidenceReference` normalizes existing Radar, Research, and Inspiration records without introducing a duplicate evidence table. A persistent `Capture evidence` action saves links, notes, social posts, screenshots, images, and PDFs through the authenticated Research repository with explicit provenance and a rapid `Save & continue` flow. Authenticated metadata extraction, project-scoped canonical duplicate warnings, rate limits, network safeguards, private Storage with signed previews, coordinated file cleanup, and strategist-captured social context are implemented. Authenticated browser acceptance confirmed manual fallback, cloud persistence, refresh hydration, source/context separation, and explicit strategist provenance.

### Goal

Make it effortless to save strategically useful material from sources that cannot be monitored comprehensively.

### Work

#### Global capture

- Add a persistent `Capture evidence` action available from every page.
- Support URL, note, quote, statistic, social post, image, screenshot, and document.
- Ask only for the source and project initially; keep notes, tags, and collections optional.
- Allow `Save and continue` for rapid research sessions.
- Store why the item matters separately from the source's original text.

#### URL capture

- Send URL extraction through a secure Edge Function.
- Retrieve permitted page metadata, canonical URL, title, author, publication date, description, and preview image.
- Preserve selected or pasted source text exactly and identify it as quoted source material.
- Show extraction failures without preventing manual saving.
- Detect duplicate canonical URLs within the project.

#### Files and screenshots

- Create a private evidence-assets Storage bucket with owner/project policies.
- Support image and PDF upload with explicit size and type limits.
- Save file metadata and processing status.
- Generate safe previews where supported.
- Add deletion behavior that removes both the database reference and private asset when appropriate.

#### Social capture

- Provide a paste-link flow for Instagram, TikTok, LinkedIn, and other unsupported sources.
- Allow pasted caption, selected comments, screenshot, author, and observed date.
- Label these items `strategist captured`; never label them connector collected.
- Preserve the original link and make limitations visible.

### Acceptance criteria

- A useful source can be saved to a project in under ten seconds when only a URL is needed.
- A screenshot or document remains private and loads after refresh.
- Failed extraction never destroys the user's manual input.
- Duplicate warnings are useful but can be overridden.
- Every saved item records how and when it entered Sift.

## Phase 3 - Evidence inbox, search, and organization

Status: **Complete.** Phase 3 passed its functional, RLS, retry-safety, citation, authenticated UI, deletion-integrity, and 10,000-item scale checkpoint. The final rollback-only benchmark reduced first-page retrieval from `4444.88 ms` to `81.35 ms`, second-page retrieval from `4567.70 ms` to `53.02 ms`, inbox totals from `4313.25 ms` to `22.92 ms`, and unique full-text search from `4784.92 ms` to `192.98 ms`. Guarded deletion now removes strategist-topic assignments before their source and leaves zero orphaned relationships. Detailed evidence is recorded in `docs/phase-3-acceptance.md`. The unified project evidence inbox combines authorized Radar mentions, Research, social captures, files, CSV imports, and Inspiration without duplicating source records. It includes project/type filters, all/needs-review/recent views, contextual cross-field search with matched-term highlighting, conservative provenance labels, partial Radar failure handling, sorting, grouping, and a common evidence detail drawer. Durable `unreviewed`, `relevant`, `irrelevant`, and `archived` states persist on the original source tables through verified project-scoped Supabase updates, with review timestamps, review progress, single-item controls, and safe bulk review. Shared tags, manual strategist topics, and non-destructive project links reuse normalized relationship tables, verify persisted results, and report partial failures. Growing inbox queries use RLS-safe PostgreSQL full-text retrieval, aggregate counts, and stable keyset cursors instead of hydrating thousands of records in the browser. Private named saved views persist query, project, type, review, sort, and grouping settings without copying evidence. The detail drawer exposes source evidence, the capture-time initial interpretation, and later editable working notes as three clearly labelled layers alongside topics, project links, strategic citations, attachments, and trends. It also opens the shared guarded deletion flow for Research and Inspiration while keeping individual Radar mentions protected. The CSV workflow keeps raw files local, previews mapping and validation, checks project duplicates, imports accepted rows into Research through a bounded RLS-invoker RPC, records retry-safe run/row history, and preserves original source text separately from strategist interpretation and notes.

Research capture and its original metadata now live inside the unified Evidence Library experience. The former `/research` page remains as a Research-filtered compatibility route so existing bookmarks keep working without maintaining a second library interface.

### Goal

Turn collection into an efficient review habit rather than an unstructured archive.

### Work

- Create one project-level evidence inbox across mentions, research, inspiration, and imports.
- Add review states: unreviewed, relevant, irrelevant, and archived.
- Support bulk review, project movement, tagging, topic assignment, notes, and evidence linking.
- Add saved views such as `Needs review`, `Important`, `Recently added`, and `Used in insights`.
- Add full-text search with filters for source type, source, project, author, date, topic, tag, and review status.
- Use cursor pagination for evidence and mention feeds.
- Return contextual excerpts and matched-term highlighting.
- Add CSV import with mapping preview, validation errors, duplicate handling, and import history.
- Add a common evidence detail drawer that shows provenance, annotations, relationships, and original source.
- Show where an item is used before deletion.

### Database work

- Add review state and capture provenance fields to relevant source records through additive migrations.
- Add an import-runs table for auditable bulk operations.
- Add missing GIN and composite indexes based on actual search and filter paths.
- Add explicit relationship tables where a new destination needs durable citations.
- Avoid OFFSET pagination for growing feeds.

### Acceptance criteria

- Search returns authorized results across all supported evidence kinds.
- A 10,000-item mention collection remains paginated and responsive.
- An imported file can be retried without duplicating accepted rows.
- Every insight-bound item can be opened at its original evidence record.
- Deleting evidence warns about existing insight, strategy, or brief relationships.

## Phase 4 - Radar as transparent discovery

Status: **Complete and accepted.** The monitor experience, connector-reliability foundation, server analytics, cursor-paged conversations, direct supporting-record retrieval, trusted scheduling, and audited retention are implemented. Radar has project-safe editing, pause/resume controls, progressive monitor configuration, explicit collection scope, bounded retries/timeouts, run diagnostics, database-enforced overlap prevention, expiring run leases, stale-run recovery, connector checkpoints, precise metric labels, and database-calculated coverage, timelines, sentiment, topics, keywords, and evidence-linked spikes over the complete authorized monitor history. RSS and YouTube can omit records already observed under an unchanged monitor definition; manual URLs remain an honest full refresh. The manual workflow passed its acceptance checkpoint, the user-configured `RDC` monitor completed a genuine automatic scheduled run on 9 August 2026, and the deliberately published retention interface was confirmed working. Per-monitor schedules, cloud-synced source settings, a Vault-authenticated scheduler, atomic due-monitor claims, bounded scheduled retries, explicit retention opt-in, protected-evidence classification, bounded deletion, and content-free audit records are implemented. The retention migration and scheduler version 2 are active in Supabase, while every monitor remains opted out unless the strategist deliberately enables it.

### Goal

Make Radar genuinely useful within its observed coverage, without implying comprehensive social-platform access.

### Work

#### Monitor experience

- Keep monitor creation to name, research question, and search terms.
- Put Boolean rules, language, market, exclusions, sources, and scheduling under advanced settings.
- Add editable monitor configuration and a source-coverage preview.
- Show exactly which connectors will run and what each can retrieve.

#### Connector reliability

- Harden YouTube, RSS, and manual URL connectors with pagination, retry policy, timeout handling, deduplication, quotas, and run diagnostics.
- Separate connector configuration from monitor configuration.
- Add source health, last successful run, errors, records retrieved, and quota state.
- Add a permitted news connector after evaluating its API terms and cost.
- Investigate official Reddit access only when real credentials and permitted use are available.
- Keep Instagram and TikTok as capture/import sources unless approved access supports a specific genuine capability.
- Never add an integration tile solely to make the source list look larger.

#### Radar analysis

- Completed: rename headline metrics to precise observed-record, comparison-period, normalized-interaction, and detected-sentiment terms.
- Completed: add separate collection-scope and analytics-coverage panels covering method, source representation, date span, record count, comparison count, stored history, and collection freshness.
- Completed: headline metrics, detected-topic scope, timelines, sentiment, topic rankings, keyword rankings, and evidence-linked spike detection use RLS-invoker server queries over complete history.
- Completed: the Radar mention feed uses cursor-paged server queries, and aggregates can retrieve supporting records directly by authorized database identity outside the currently visible page.
- Preserve clickable volume, sentiment, source, topic, keyword, mention, and spike exploration.
- Route useful mentions into the evidence inbox and downstream relationships.

#### Scheduling

- Add manual runs first, then scheduled runs after quotas, idempotency, locking, and failure recovery are proven.
- Prevent overlapping runs for the same monitor.
- Store execution state and cursors so a failed run can resume safely where the connector supports it.
- Add per-monitor retention and pause controls.

Current checkpoint: the manual and scheduled Radar workflows passed the acceptance record in [phase-4-acceptance.md](phase-4-acceptance.md). Manual and scheduled calls share one collection orchestrator and are locked to one active execution per monitor. The trusted scheduler design uses `pg_cron`, `pg_net`, Vault, a verified-JWT Edge Function, atomic expiring claims, existing user quotas, and the last safe per-source cursor. Source URLs and enablement sync to authorized project connector records; API keys remain function secrets. The production cron job is active, the first user-configured scheduled run completed successfully, and scheduler version 2 returns HTTP 200 after the retention hook deployment. Retention enforcement is service-role-only, explicitly off by default, limited to 250 records per successful scheduled run, protected by shared classification and concurrency locks, and recorded in an RLS-protected audit table. A rollback-only live test verified all nine protection routes and left zero residue. The deployed opt-in control was subsequently confirmed working, closing Phase 4.

### Acceptance criteria

- Every displayed metric names or exposes its coverage.
- One source can fail without erasing valid results from other sources.
- Re-running a monitor does not duplicate identical source records.
- A spike always links to the items that caused the measured increase.
- A likely driver is shown only when the configured support threshold is met.
- The interface states `No clear driver identified` when evidence is insufficient.
- Unsupported sources cannot be enabled or mistaken for live collection.

## Phase 5 - Signals and analytical reasoning

Status: **Complete and accepted.** The acceptance evidence is documented in [phase-5-acceptance.md](phase-5-acceptance.md). Three increments established the project-scoped Signals workspace, inspectable evidence and assessment trail, correction and lineage history, and database-enforced promotion into an observed Trend. The strategist completed the short real-use confirmation on 10 August 2026 and confirmed the evidence-trail workflow after permanent disposal of a test candidate was added. No candidate is automatically promoted, no relationship is inferred, unavailable growth stays missing, and no assessment score appears until the strategist creates a snapshot.

### Goal

Help the strategist identify what deserves attention before asking AI to produce recommendations.

### Work

- Keep deterministic sentiment, keyword, engagement, growth, and spike processing modular.
- Version processing outputs so rules can change without obscuring how an earlier result was produced.
- Improve topic assignment with transparent keyword rules first, then optional embeddings or model-assisted clustering.
- Create signal records that track supporting evidence, source diversity, author diversity, growth, recency, and contradictions.
- Distinguish `signal`, `emerging pattern`, `observed trend`, and `hypothesis`.
- Add evidence sufficiency checks before promoting a signal.
- Detect strengthening, weakening, newly appearing, and contradictory evidence.
- Let the user merge, split, rename, dismiss, and annotate topics and signals.
- Add a research-gap prompt: what source, audience, market, or counterexample is missing?
- Preserve transparent factor breakdowns instead of a single unexplained score.

### Database work

- Reuse `topics`, `trends`, `trend_mentions`, and score-factor fields where their meaning fits.
- Add signal status, analysis version, and contradiction relationships only as needed.
- Store generated summaries separately from source text.
- Record the algorithm or model version that created each derived result.

### Acceptance criteria

- Every signal can be opened into supporting and contradicting evidence.
- A user can correct topic membership without changing the original source content.
- Reprocessing is auditable and does not silently rewrite historical claims.
- Signal strength decreases or remains uncertain when evidence is narrow or contradictory.
- No global trend claim is made from a limited observed sample.

## Phase 6 - Evidence-grounded Strategy AI

Status: **Complete and accepted.** The acceptance evidence is documented in [phase-6-acceptance.md](phase-6-acceptance.md). The evidence boundary, manual ChatGPT handoff, structured response contract, citation validator, durable conversation persistence, transparent retrieval, session continuity, plain-language prompt, and readable answer hierarchy are implemented. The JWT-protected `strategy-ai` Edge Function retrieves an inspectable project evidence scope and revalidates the strategist's exact selection under the caller's RLS context before accepting a pasted response. Sift sends nothing automatically, rejects changed or inaccessible identities, enforces classified and cited claims, fixes provenance as a manual handoff, and atomically persists validated conversations through a service-only database function. The strategist confirmed the deployed workflow works for current use on 10 August 2026. No OpenAI API key or separate model billing is required.

### Goal

Answer strategic questions using the user's authorized workspace while keeping general brainstorming clearly separate.

### Work

#### Secure handoff boundary

- Keep ChatGPT authentication entirely outside Sift; never request or store the user's subscription credentials.
- Show the exact prompt and selected evidence before the strategist copies anything.
- Retrieve only evidence the caller can access through project ownership and RLS.
- Add per-request evidence and response-size limits plus structured error handling.
- Revalidate the selected scope before storing an imported response.
- Store conversation scope, manual provenance, citations, and structured claims.

#### Retrieval

- Begin with PostgreSQL full-text search plus filters and recency/source weighting.
- Return normalized evidence references with excerpts and stable IDs.
- Add semantic/vector retrieval later only after retrieval evaluation shows it improves results.
- Include contradictory or low-confidence evidence when relevant.
- Let the user inspect and adjust the evidence scope before asking.

#### Response contract

- Require structured blocks for measured evidence, interpretation, hypothesis, recommendation, confidence, and limitations.
- Require a valid evidence ID for every workspace-backed factual claim.
- Reject or relabel claims whose citations are absent or inaccessible.
- Label responses `Workspace-backed analysis`, `Mixed analysis`, or `General AI response`.
- Allow a user to challenge a claim, inspect sources, remove weak evidence, and regenerate.

#### Evaluation and cost controls

- Build a small evaluation set from real strategist questions and known evidence.
- Test citation validity, evidence coverage, unsupported-claim rate, and usefulness.
- Test the copy, paste, validation, citation, and storage flow with real strategist questions.
- Do not launch automatic daily AI analysis while Sift relies on the user's manual ChatGPT subscription workflow.

### Acceptance criteria

- Clicking every citation opens an authorized source record.
- Removing a cited source changes or weakens the resulting analysis appropriately.
- General responses never appear as workspace findings.
- The response states when evidence is insufficient or one-sided.
- Evaluation cases meet an agreed citation-validity threshold before Strategy AI is treated as production-ready.
- No API credential or additional model payment is required for the accepted manual workflow.

## Phase 7 - Insight, strategy, and creative outputs

Status: **In progress. Increments 1 through 3 implemented.** The audit is documented in [phase-7-audit.md](phase-7-audit.md). The trusted pipeline foundation is live, and the first project-scoped Insight Builder now writes durable sessions and editable Observation → Pattern → Tension → Insight → Opportunity stages, links original evidence, and keeps Signal/AI starting points as separate provenance. Increment 4 will surface the existing uncertainty, dependency, approval, and revision contracts in the interface.

### Goal

Complete the path from evidence to a usable strategic and creative decision.

### Work

#### Insight builder

- Create editable observation, pattern, tension, insight, and opportunity stages.
- Require evidence relationships for measured observations and workspace-backed insights.
- Show confidence and unresolved research gaps.
- Preserve alternative interpretations rather than forcing one conclusion.

#### Strategy pipeline

- Reuse `strategy_sessions` and `strategy_stages`.
- Allow stages to be reordered, edited, approved, and versioned.
- Show which earlier claims each later stage depends on.
- Add a strategic proposition only after the opportunity is explicit.

#### Creative territories

- Generate meaningfully distinct territories from selected insights.
- Include core thought, cultural connection, brand role, audience truth, executions, tone, and risks.
- Show the evidence and strategy stages used to generate each territory.
- Let the user compare, combine, reject, and manually develop territories.

#### Briefs

- Build briefs from selected evidence, insights, competitor findings, and territories.
- Keep every field editable.
- Add a source-evidence appendix.
- Add draft/version history before export.
- Add document or PDF export only after the on-screen brief is reliable.

### Acceptance criteria

- A source can be traced through an insight and proposition into a brief.
- Editing generated output never overwrites source evidence.
- Territory options differ strategically, not just in wording.
- Brief claims retain citations after manual editing and export.
- The complete workflow works without any predetermined brand or demo content.

## Phase 8 - Daily-driver operations

### Goal

Make Sift dependable enough to remain open throughout real strategy work.

### Work

- Build a lightweight browser capture extension after the capture API stabilizes.
- Add a daily home view for new evidence, review queue, strengthening signals, source failures, and research gaps.
- Add export and backup for projects and evidence.
- Add connector quota, Strategy handoff history, and response-validation health views.
- Add configurable retention, archive, and permanent-deletion workflows.
- Add structured operational logs without storing secrets or unnecessary source content.
- Add scheduled-run alerts and retry controls.
- Add accessibility, mobile, keyboard-navigation, and performance passes.
- Add restore testing and a written recovery procedure.
- Review whether GitHub Pages remains sufficient; move hosting only if authenticated routing, server rendering, or operational needs justify it.

### Acceptance criteria

- A failed connector or AI request is visible and recoverable.
- The user can export a complete project with evidence relationships.
- Backup restoration is tested, not assumed.
- Usage limits are visible before quotas are exhausted.
- The core capture, review, analysis, and strategy workflow passes an end-to-end regression suite.

## Testing strategy

Every phase should add tests at the layer where its risk lives.

### Unit tests

- Query parsing and Boolean evaluation.
- Normalization, deduplication, content hashing, and URL canonicalization.
- Sentiment, keywords, topics, spike thresholds, signal factors, and confidence rules.
- Evidence-to-claim validation.

### Database tests

- Ownership and membership RLS for select, insert, update, and delete.
- Attempts to access another project by ID.
- Cascade behavior and protected deletes.
- Idempotent imports and connector upserts.
- Full-text search and cursor ordering.

### Integration tests

- Sign in -> create project -> refresh -> retrieve project.
- Capture URL/file -> review -> search -> attach to insight.
- Run monitor -> retrieve normalized mentions -> inspect spike -> save evidence.
- Ask Strategy AI -> validate citations -> open evidence.
- Insight -> strategy stage -> territory -> brief.

### Production checks

- Lint, TypeScript, tests, and static production build.
- Secret scanning and static-bundle inspection.
- Browser verification at the GitHub Pages base path.
- Edge Function authentication and error-path verification.
- Database advisors and migration reproducibility checks before schema releases.

## Priority rules

### P0 - Required for trustworthy personal use

- Permanent identity.
- Cloud source of truth.
- Private, durable evidence capture.
- Evidence inbox and search.
- Transparent source coverage.
- Citation integrity.
- Backup and recovery.

### P1 - Required for strong strategist value

- Reliable permitted connectors.
- Topic and signal workflow.
- Workspace-backed Strategy AI.
- Insight and strategy pipeline.
- Creative territories and briefs.

### P2 - Valuable after the core loop works

- Browser extension.
- Scheduled daily briefings.
- Semantic/vector retrieval.
- Advanced competitor comparisons.
- Additional licensed connectors.
- Rich exports and presentation formats.

## Explicitly deferred

- Unofficial scraping of Instagram, TikTok, LinkedIn, X, or other restricted platforms.
- Universal share-of-voice claims.
- Publishing and scheduling.
- Multi-tenant agency administration beyond what is needed for secure ownership.
- Complex vector infrastructure before full-text retrieval is evaluated.
- Automated strategic conclusions without an inspectable evidence trail.
- Decorative dashboards that do not support a research or decision workflow.

## Immediate implementation sequence

Phases 0 through 6 are complete and accepted. Phase 7 is in progress; its audit, trusted database foundation, and first project-scoped Insight Builder are implemented. The next increment will expose uncertainty and traceability: confidence, research gaps, contradictions, alternatives, dependencies, approval state, and immutable revisions. The accepted Phase 6 workflow remains an optional evidence-grounded thinking input; no automatic or background AI analysis is introduced.

1. **Complete:** Audit the existing insight, strategy-session, strategy-stage, citation, and evidence-link schema before adding Phase 7 records. See [phase-7-audit.md](phase-7-audit.md).
2. **Complete:** Establish the trusted Supabase foundation for stage evidence, Signal/AI provenance, dependencies, alternatives, approval, revision history, deletion protection, RLS, grants, and foreign-key indexes.
3. **Complete:** Build one project-scoped insight workspace that can start from selected Evidence, Signals, or a saved Strategy AI analysis.
4. **Complete:** Add editable observation, pattern, tension, insight, and opportunity stages with explicit evidence relationships.
5. Show confidence, unresolved evidence gaps, contradictions, and alternative interpretations without forcing one conclusion.
6. Surface stage ordering, approval state, and version history without allowing edits to overwrite source evidence.
7. Extend the pipeline through a strategic proposition only after the opportunity is explicit.
8. Run the Phase 7 insight-pipeline acceptance checkpoint before adding creative territories, briefs, or exports.

## Definition of a successful first strategist release

The first strategist release is successful when one real project can be completed through this loop without demo content or unsupported claims:

1. Sign in and create a private project.
2. Add a research question.
3. Run at least one permitted monitor.
4. Capture several external social or cultural examples manually.
5. Import or save supporting research.
6. Review and organize the combined evidence.
7. Identify a supported pattern and a plausible tension.
8. Ask a workspace-backed question and inspect valid citations.
9. Turn the insight into distinct creative territories.
10. Produce an editable brief with a source-evidence appendix.

Until that complete loop works reliably, additional dashboards and connector promises are secondary.
