# Sift architecture

## Product boundary

Sift is a strategy intelligence workspace, not a publishing or scheduling product. Every module should help a strategist discover a signal, understand its meaning, or turn evidence into a strategic and creative decision.

## Runtime shape

The current application is a statically exported Next.js app for GitHub Pages. New browser profiles must sign in with the linked GitHub account before opening the private workspace.

```text
Next.js static client
  ├─ browser-local personal repository
  ├─ page modules and reusable intelligence components
  ├─ normalized connector contracts
  └─ authenticated Supabase boundary
       ├─ PostgreSQL + full-text search
       ├─ Auth + Row Level Security
       ├─ Storage for future media uploads
       └─ Edge Functions for secure AI and connector execution
```

GitHub Pages cannot protect an OpenAI or connector secret. Radar calls an authenticated Supabase Edge Function for RSS, manual URL, and YouTube collection. Future scheduled jobs and Strategy AI calls belong in the same private runtime. The browser never receives a private API key.

## Data ownership

- Personal projects, research, inspiration, saves, Radar monitors, notes, important marks, and evidence relationships have dedicated browser-storage keys.
- The interface does not seed records or infer analytics when the workspace is empty.
- Connector runs use the verified permanent Supabase user and write through `owner_id`, project membership checks, and Row Level Security.
- Workspace routes require a verified, non-anonymous session. The Account route remains public for sign-in and recovery.
- GitHub is the only enabled sign-in provider. Anonymous access, manual identity linking, email authentication, and new account registration are disabled in the personal production project.
- Device caches are scoped to the Supabase user ID; legacy unscoped records can be claimed only once by the account that completes the migration.
- Local records make the static interface resilient, but the application distinguishes device persistence from authenticated cloud persistence.

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
