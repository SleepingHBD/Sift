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

GitHub Pages cannot protect an OpenAI or connector secret. Radar calls an authenticated Supabase Edge Function for RSS, manual URL, and YouTube collection. Future scheduled jobs and Strategy AI calls belong in the same private runtime. The browser never receives a private API key.

## Data ownership

- Projects are cloud-first and hydrate from Supabase after the permanent GitHub session is verified.
- Project create, update, archive, restore, and delete operations use the authenticated Data API under Row Level Security. The database derives `owner_id` from `auth.uid()` when a project is created.
- Stable `client_ref` values and a unique `(owner_id, client_ref)` constraint make browser-project imports safe to retry.
- Research and Inspiration hydrate from project-scoped Supabase repositories. Their stable client references and unique `(project_id, client_ref)` constraints make browser imports safe to retry.
- New Research and Inspiration records derive `created_by` from `auth.uid()` and require an accessible destination project; the browser never supplies a user ID.
- Brand/client context and competitors remain relational records; project cards use database-derived mention, research, and insight counts.
- Radar monitors, connector-created mentions, topics, and monitor runs hydrate from authenticated Supabase repositories. Stable monitor and run references plus cursor indexes support retry-safe browser migration and bounded cloud reads.
- Saved markers, Radar notes, important marks, and evidence relationships hydrate through authenticated per-user repositories. Their old browser keys exist only as reviewed migration inputs.
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

Every normalized reference carries a stable record and project identity, evidence kind, original source and content where available, separate strategist notes, capture and publication times, tags/topics, processing and review state, attachment references, and inspectable provenance metadata. Kind-specific fields such as Radar engagement or a Research collection remain available without weakening the common citation contract.

Existing records infer capture provenance conservatively from stored metadata and source type. Missing original text, run IDs, hashes, or attachments remain absent instead of being fabricated. Phase 2 capture writes populate provenance for new evidence; the later evidence-inbox phase can add dedicated review columns if actual query paths require them.

The authenticated shell exposes a persistent capture action. URL, note, screenshot, image, and PDF captures write through the existing project-scoped Research repository, record `global_capture` plus an explicit capture method, and keep source material separate from the strategist's optional “why it matters” annotation. Files are limited by both the client and the private `evidence-assets` bucket, use uploader/project-scoped paths, persist metadata in `evidence_assets`, and load through short-lived signed links. This avoids a browser-only capture queue and keeps Row Level Security as the ownership boundary.

URL inspection runs through the authenticated `radar-connectors` Edge Function. The function verifies project access with the caller-scoped Supabase client, applies a separate service-only extraction quota, rejects private/local addresses and nonstandard ports, validates DNS results, follows a bounded number of manually checked redirects, and limits response type, size, and duration. Extracted titles, canonical URLs, author/publication details, dates, descriptions, and preview-image references are stored as provenance metadata; the original submitted URL remains unchanged. Project-scoped duplicate warnings compare original, final, and canonical URLs and can be overridden deliberately. If a source blocks extraction, the raw URL can still be saved with `extraction_status: skipped`.

Strategist-captured social posts reuse the Research repository instead of pretending to be connector mentions. Their metadata stores the platform, optional account, selected caption and comments, observed date, and a visible `strategist` capture method. An optional screenshot follows the same private Storage, signed-link, rollback, and deletion path as other evidence assets.

## Processing pipeline

```text
fetch → normalize → deduplicate → language → sentiment/topics/entities
      → store evidence → aggregate baselines → directional trend score
      → retrieve evidence → structured AI claims + citations
```

Radar processors handle sentiment, keyword extraction, topic assignment, engagement normalization, comparison-period growth, and spike detection outside React. Likely spike drivers appear only when a topic crosses a support threshold and at least two mentions can be cited; otherwise the interface reports that no clear driver was identified.

## Search and security

The schema uses generated `tsvector` columns and GIN indexes. A later embedding table can add vector search without replacing full-text search. Retrieval should use hybrid ranking and always return source IDs.

- Supabase Auth owns identity.
- Project-scoped tables use Row Level Security and `can_access_project`.
- Only public client keys enter the browser.
- OpenAI keys, connector tokens, scheduled jobs, and ingestion stay server-side.
- Radar runs require a platform-verified user JWT and pass through atomic per-user quotas before connector work begins.
- AI messages store structured claims and citations for inspectable provenance.
