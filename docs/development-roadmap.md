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
- Research and inspiration forms do not yet upload files, extract content, or save rich provenance.
- Strategy AI is a labelled framing placeholder, not a server-backed evidence retrieval system.
- Several database relationships use polymorphic IDs whose integrity is enforced by application code rather than foreign keys.
- The mention feed is client-aggregated and not yet designed for large, paginated collections.
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

Status: **In progress; manual Radar accepted.** The monitor experience, connector-reliability foundation, server analytics, cursor-paged conversations, and direct supporting-record retrieval are complete. Radar now has project-safe editing, pause/resume controls, progressive monitor configuration, explicit collection scope, bounded retries/timeouts, run diagnostics, database-enforced overlap prevention, expiring run leases, stale-run recovery, connector checkpoints, precise metric labels, and database-calculated coverage, timelines, sentiment, topics, keywords, and evidence-linked spikes over the complete authorized monitor history. RSS and YouTube can omit records already observed under an unchanged monitor definition; manual URLs remain an honest full refresh. The manual workflow passed its acceptance checkpoint. Scheduled jobs and retention controls are the remaining Phase 4 increment.

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

Current checkpoint: the manual Radar workflow passed the acceptance record in [phase-4-acceptance.md](phase-4-acceptance.md). Manual runs are locked to one active execution per monitor. A trusted Edge Function creates the run before collection, retains the last safe per-source cursor when one connector fails, and marks an expired lease failed before allowing a retry. No `pg_cron`, `pg_net`, or background schedule has been enabled. Safe scheduled execution and retention controls are next.

### Acceptance criteria

- Every displayed metric names or exposes its coverage.
- One source can fail without erasing valid results from other sources.
- Re-running a monitor does not duplicate identical source records.
- A spike always links to the items that caused the measured increase.
- A likely driver is shown only when the configured support threshold is met.
- The interface states `No clear driver identified` when evidence is insufficient.
- Unsupported sources cannot be enabled or mistaken for live collection.

## Phase 5 - Signals and analytical reasoning

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

### Goal

Answer strategic questions using the user's authorized workspace while keeping general brainstorming clearly separate.

### Work

#### Secure AI boundary

- Call the model only from an authenticated Edge Function or another private server runtime.
- Keep model credentials server-side.
- Retrieve only evidence the caller can access through project ownership and RLS.
- Add per-request evidence limits, token limits, timeouts, and structured error handling.
- Store conversation scope, model, citations, and structured claims.

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
- Add request budgets, model selection by task, usage summaries, and hard monthly limits.
- Do not launch automatic daily AI analysis until manual requests are reliable and affordable.

### Acceptance criteria

- Clicking every citation opens an authorized source record.
- Removing a cited source changes or weakens the resulting analysis appropriately.
- General responses never appear as workspace findings.
- The response states when evidence is insufficient or one-sided.
- Evaluation cases meet an agreed citation-validity threshold before Strategy AI is treated as production-ready.

## Phase 7 - Insight, strategy, and creative outputs

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
- Add connector quota and AI usage dashboards.
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

Phases 0, 1, 2, and 3 are complete. Phase 4 is in progress, with its manual Radar workflow accepted. Monitor configuration, transparent source coverage, connector reliability, run diagnostics, run locking and recovery, complete-history analytics, cursor-paged conversations, and direct supporting-record retrieval are implemented. Safe scheduled execution and per-monitor retention controls are next. Phase 3 was delivered through these verified increments:

1. Create a project evidence inbox over the shared evidence reference contract, with search, core filters, provenance, and a common detail drawer. **Completed.**
2. Add persistent review states through an additive migration and explicit single-item review actions. **Completed.**
3. Add bulk review and organization actions with safe partial-failure reporting. **Completed.**
4. Move growing inbox queries to server-side full-text retrieval and cursor pagination. **Completed.**
5. Add private durable Evidence Inbox saved views. **Completed.**
6. Add relationship visibility and protected deletion warnings. **Completed.**
7. Add CSV import mapping, validation, duplicate handling, and import history. **Completed.**
8. Complete topic-assignment and editable strategist-note workflows. **Completed.**
9. Run the Phase 3 acceptance checkpoint. **Completed: deletion integrity, tenant isolation, and 10k query performance pass.**

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
