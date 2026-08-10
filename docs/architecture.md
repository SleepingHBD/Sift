# Sift architecture

## Product boundary

Sift is a strategy intelligence workspace, not a publishing or scheduling product. Every module should help a strategist discover a signal, understand its meaning, or turn evidence into a strategic and creative decision.

## Runtime shape

The current application is a statically exported Next.js app for GitHub Pages. New browser profiles must sign in with the linked GitHub account before opening the private workspace.

```text
Next.js static client
  ├─ Supabase project, research, and inspiration repositories
  ├─ browser-local migration candidates and UI preferences
  ├─ page modules and reusable intelligence components
  ├─ normalized connector contracts
  └─ authenticated Supabase boundary
       ├─ PostgreSQL + full-text search
       ├─ Auth + Row Level Security
       ├─ private Storage for evidence screenshots and documents
       └─ Edge Functions for secure AI and connector execution
```

GitHub Pages cannot protect connector or model secrets. Radar calls authenticated Supabase Edge Functions for RSS, manual URL, and YouTube collection. Strategy AI's default path requires no model secret: its authenticated function retrieves authorized evidence and validates a response the strategist manually brings back from ChatGPT. The browser never receives a private API key or service-role credential.

## Data ownership

- Projects are cloud-first and hydrate from Supabase after the permanent GitHub session is verified.
- Project create, update, archive, restore, and delete operations use the authenticated Data API under Row Level Security. The database derives `owner_id` from `auth.uid()` when a project is created.
- Stable `client_ref` values and a unique `(owner_id, client_ref)` constraint make browser-project imports safe to retry.
- Research and Inspiration hydrate from project-scoped Supabase repositories. Their stable client references and unique `(project_id, client_ref)` constraints make browser imports safe to retry.
- New Research and Inspiration records derive `created_by` from `auth.uid()` and require an accessible destination project; the browser never supplies a user ID.
- Brand/client context and competitors remain relational records; project cards use database-derived mention, research, and insight counts.
- Radar monitors, connector-created mentions, topics, and monitor runs hydrate from authenticated Supabase repositories. Stable monitor and run references plus cursor indexes support retry-safe browser migration and bounded cloud reads. Monitor edits are constrained to the existing project boundary, while a reusable collection-scope model separately evaluates monitor configuration, backend availability, and genuine connector capability. Permanent-account-only, security-invoker `radar_monitor_summary` and `radar_monitor_analysis` RPCs calculate coverage, headline metrics, timelines, sentiment, topics, keywords, and evidence-linked spikes over the full RLS-authorized monitor history for the selected period and optional detected topic.
- Saved markers, Radar notes, important marks, and evidence relationships hydrate through authenticated per-user repositories. Their old browser keys exist only as reviewed migration inputs.
- Working Signals hydrate from project-scoped `signals`, `signal_evidence`, and append-only `signal_snapshots` records. They remain analytically separate from promoted `trends`: an observation or hypothesis can be watched or dismissed without becoming a measured trend, while the detail workflow searches same-project evidence, keeps source text distinct from capture-time interpretation and later notes, and makes support, contradiction, scope, rationales, limitations, research gaps, and assessment history inspectable.
- The interface does not seed records or infer analytics when the workspace is empty.
- Connector runs use the verified permanent Supabase user and write through `owner_id`, project membership checks, and Row Level Security.
- Workspace routes require a verified, non-anonymous session. The Account route remains public for sign-in and recovery.
- GitHub is the only enabled sign-in provider. Anonymous access, manual identity linking, email authentication, and new account registration are disabled in the personal production project.
- Device migration candidates are scoped to the Supabase user ID; legacy unscoped records can be claimed only once by the account that completes the migration.
- The Projects page previews local records, offers a JSON backup, imports idempotently, and clears project payloads only after cloud verification.
- The Research and Inspiration pages apply the same reviewed migration rule and require the user to choose the correct project for legacy items before import.
- Radar applies the same backup-before-import rule, preserves project and evidence associations, and clears core or annotation caches only after the corresponding cloud copy reloads successfully.

## Primary routes

| Route | Decision supported |
| --- | --- |
| `/` | What should I investigate or add next? |
| `/radar` | What is moving in monitored conversations? |
| `/evidence` | What has been collected, what needs review, and where did it come from? |
| `/trends` | Which evidence-backed signals are emerging? |
| `/brands` | What brand context should constrain the work? |
| `/competitors` | What does each brand own and where is the gap? |
| `/inspiration` | What work is worth remembering and why? |
| `/research` | What evidence has been collected? |
| `/strategy-ai` | What pattern, tension, insight, and opportunity follow? |
| `/briefs` | What should a creative team make from this evidence? |
| `/projects` | Which strategic question does each knowledge set serve? |
| `/settings` | Which services are connected or unavailable? |

## Connector contract

Every connector implements `DataConnector<TRaw>` with `searchMentions`, `fetchMention`, `normalizeMention`, `validateCredentials`, and `getCapabilities`. Normalization happens at the connector boundary so downstream processing never depends on platform-specific payloads.

Connector states are `live`, `not-connected`, or `coming-later`. A source is never presented as live until it retrieves records through a permitted interface.

The current secure runtime implements RSS/Atom feeds, user-supplied public pages, and YouTube's official Data API. Source URLs and monitor definitions originate in the client; credentials and network retrieval remain server-side.

## Evidence reference contract

Radar mentions, Research items, and Inspiration items remain in their purpose-built tables. Sift normalizes them at the application boundary through the discriminated `EvidenceReference` union in `lib/evidence/reference.ts`; it does not duplicate source records in a generic evidence table.

Every normalized reference carries a stable record and project identity, evidence kind, original source and content where available, a separate capture-time initial interpretation, separate working strategist notes, capture and publication times, tags/topics, processing and review state, attachment references, and inspectable provenance metadata. Kind-specific fields such as Radar engagement or a Research collection remain available without weakening the common citation contract.

CSV imports are an ingestion path into `research_items`, not a new evidence silo. Parsing, header mapping, and the raw file stay in the browser; an authenticated `SECURITY INVOKER` RPC revalidates up to 500 mapped rows, checks project-scoped content hashes and URLs, creates shared tag links, and records minimal outcomes in `evidence_import_runs` and `evidence_import_rows`. `(owner_id, client_ref)` makes a completed request safe to retry without creating a second copy.

Existing records infer capture provenance conservatively from stored metadata and source type. Missing original text, run IDs, hashes, or attachments remain absent instead of being fabricated. Phase 2 capture writes populate provenance for new evidence; the later evidence-inbox phase can add dedicated review columns if actual query paths require them.

The authenticated shell exposes a persistent capture action. URL, note, screenshot, image, and PDF captures write through the existing project-scoped Research repository, record `global_capture` plus an explicit capture method, and keep source material separate from the strategist's optional initial interpretation. The interpretation is stored in `research_items.key_findings`; later working notes use `research_items.notes` and never replace it. Files are limited by both the client and the private `evidence-assets` bucket, use uploader/project-scoped paths, persist metadata in `evidence_assets`, and load through short-lived signed links. This avoids a browser-only capture queue and keeps Row Level Security as the ownership boundary.

URL inspection runs through the authenticated `radar-connectors` Edge Function. The function verifies project access with the caller-scoped Supabase client, applies a separate service-only extraction quota, rejects private/local addresses and nonstandard ports, validates DNS results, follows a bounded number of manually checked redirects, and limits response type, size, and duration. Extracted titles, canonical URLs, author/publication details, dates, descriptions, and preview-image references are stored as provenance metadata; the original submitted URL remains unchanged. Project-scoped duplicate warnings compare original, final, and canonical URLs and can be overridden deliberately. If a source blocks extraction, the raw URL can still be saved with `extraction_status: skipped`.

Strategist-captured social posts reuse the Research repository instead of pretending to be connector mentions. Their metadata stores the platform, optional account, selected caption and comments, observed date, and a visible `strategist` capture method. An optional screenshot follows the same private Storage, signed-link, rollback, and deletion path as other evidence assets.

The Evidence Inbox is an application projection over those normalized references. The `search_evidence_page` database function unions only records already authorized by project Row Level Security, returns the shared evidence-reference shape without copying source content, and omits unassigned Personal Radar records from the project-level queue. Search uses PostgreSQL full-text indexes for preserved source text and also covers initial interpretations, working notes, authors, topics, tags, and provenance. The detail drawer visibly separates source evidence, the capture-time initial interpretation, and later working notes. Research and Inspiration sources expose the shared guarded deletion dialog from the drawer; the RLS-invoker deletion function rechecks project access and refuses to remove sources with strategic citations.

Inbox retrieval is server-paged in batches of 50. Each opaque cursor is bound to the active sort and records the final stable sort value, creation timestamp, source kind, and source ID; this provides deterministic keyset pagination without growing `OFFSET` scans. Project, linked-project, type, view, date, and query filters are applied before the page is returned. A separate RLS-filtered aggregate function supplies inbox counts without requiring the browser to hydrate the entire workspace. Both functions are security-invoker routines available only to authenticated users.

Named Evidence Inbox views persist only retrieval and presentation settings in `evidence_saved_views`: search phrase, optional accessible project, evidence type, review view, sort, and grouping. The table is owned directly by the authenticated identity, protected by four operation-specific RLS policies plus Sift's restrictive permanent-account policy, and explicitly unavailable to `anon`. A case-insensitive owner/name index prevents ambiguous duplicate shortcuts. Deleting a saved view removes only the shortcut; it never touches evidence or organization relationships.

Each source table carries the same constrained `review_status` and optional `reviewed_at` fields. Single and bulk review operations update the original rows in source-specific groups, require Supabase to return every persisted row, and surface partial failures instead of optimistically hiding them. Resetting to `unreviewed` clears the review timestamp.

Evidence organization reuses the normalized `tags` and `item_tags` tables. Shared tags remain separate from source-generated topics and labels, and bulk tag operations normalize case and whitespace before writing. The Phase 3 RLS policies verify that the evidence source, tag, and organization row all belong to the same accessible source project.

Manual strategist taxonomy uses `evidence_topics` and `evidence_topic_assignments`. Topics are project-scoped, can be assigned to mentions, Research, or Inspiration individually or in bulk, and remain separate from source-extracted keywords and Radar-detected conversation topics. A composite foreign key keeps assignments inside their source project, and supporting indexes cover both item and topic lookup paths. `update_evidence_note` edits only the strategist annotation field for each source kind; it never overwrites preserved source text. Both strategist notes and manual topics participate in the RLS-safe full-text evidence search.

Adding evidence to another project is deliberately non-destructive. The original record and its source project stay authoritative; an idempotent `saved_items` row with destination `project` records the accessible target project. The inbox can filter by either the source project or these linked projects, while the detail drawer names both. Restrictive RLS policies validate source-project integrity and target-project access. No generic evidence table, anonymous grant, or policy exception was introduced.

Relationship inspection is a single RLS-scoped `list_evidence_relationships` call made only for the evidence currently open in the detail drawer or deletion dialog. It returns tags, project links, saved destinations, private assets, notes, trends, signals, and strategic citations without copying the source record. Signal citations are blocking relationships, so guarded evidence deletion and scheduled Radar retention cannot silently remove their source. Reverse lookup indexes cover strategic source relationships, avoiding a browser-side N+1 scan.

Research and Inspiration deletion uses the security-invoker `delete_evidence_item` database function rather than a direct table delete. The function locks and verifies the caller-visible source, refuses deletion while an insight or brief citation remains, then removes user-owned organization links and the source in one transaction. Explicit grants restrict both relationship functions to authenticated permanent accounts; existing Row Level Security remains the authorization boundary. Storage objects are cleaned up after the database confirms the source deletion, with a visible warning if Storage cleanup needs attention.

## Processing pipeline

```text
fetch → normalize → deduplicate → language → sentiment/topics/entities
      → store evidence → aggregate baselines → directional trend score
      → retrieve evidence → structured AI claims + citations
```

Radar processors handle sentiment, keyword extraction, topic assignment, engagement normalization, comparison-period growth, and spike detection outside React. Headline counts, sentiment proportions, source diversity, author diversity, interaction totals, date span, and comparison-period growth are now calculated in PostgreSQL so the browser's bounded evidence hydration cannot silently limit them. Detailed charts, spikes, topics, and strategist observations still operate on the hydrated evidence window until their server-paged aggregate queries are implemented. Likely spike drivers appear only when a topic crosses a support threshold and at least two mentions can be cited; otherwise the interface reports that no clear driver was identified.

Signal assessment also stays outside React. `signal-heuristic-v1` combines supporting-record volume, source and author diversity, optional comparison-window growth, optional recency, and a contradiction penalty. Missing growth or recency is recorded as unavailable rather than converted into positive evidence. Every persisted assessment is a new immutable snapshot with its method, factor breakdown, limitations, research gaps, and version; earlier assessments are not silently rewritten when rules change.


## Search and security

The schema uses generated `tsvector` columns and GIN indexes. A later embedding table can add vector search without replacing full-text search. Retrieval should use hybrid ranking and always return source IDs.

- Supabase Auth owns identity.
- Project-scoped tables use Row Level Security and `can_access_project`.
- Only public client keys enter the browser.
- Connector tokens, optional future model keys, scheduled jobs, and ingestion stay server-side.
- Selected Strategy AI evidence leaves Sift only when the strategist deliberately copies the visible ChatGPT handoff prompt.
- Radar runs require a platform-verified user JWT and pass through atomic per-user quotas before connector work begins.
- AI messages store structured claims and citations for inspectable provenance.
