# Radar architecture

Radar moves from a monitor definition to inspectable evidence without coupling the interface to a social platform.

The interface uses progressive disclosure: **Overview** prioritizes the primary signal, spikes, and strategist observations; **Topics** contains topic, source, sentiment, and keyword analysis; **Mentions** owns search and filtering; and **Evidence** collects saved, important, and linked source material.

```text
monitor definition
  → connector capability and credential check
  → searchMentions
  → connector-specific normalizeMention
  → normalized mentions
  → deterministic processing
  → metrics / timelines / topics / spikes
  → mention detail
  → saved evidence relationship
```

## Monitor definitions and coverage

The default monitor form asks for a natural-language monitoring subject and derives an inspectable name and query. The optional advanced editor keeps the research question, project context, brand, competitors, language, market, source scope, and `AND` / `OR` / `NOT` rules out of the primary flow. Existing monitors can be edited and paused without changing or deleting their collected evidence. A monitor stays in its original project because moving it would also change the ownership boundary of its evidence.

Connector configuration remains separate from monitor configuration. The Sources drawer controls workspace-level RSS feeds, public page URLs, and YouTube availability; the monitor only narrows which configured sources are eligible. Leaving the monitor's source scope empty means "use every configured permitted source", not "search every platform".

The shared coverage model reports each source as **Ready**, **Needs setup**, **Backend setup**, **Not included**, or **Unavailable**. It names the collection method, configuration state, and retrievable record types. Unsupported Reddit and news access cannot be enabled, and Instagram, TikTok, LinkedIn, Facebook, and X remain strategist-capture inputs rather than connector-collected data.

New monitor definitions persist immediately to the authenticated Supabase workspace and start with no records. Updates target both the monitor ID and its original project ID under the existing project-access Row Level Security policy. A run invokes the JWT-protected connector function, writes normalized evidence and an auditable run to PostgreSQL through Row Level Security, then reloads the authoritative cloud rows. The server enforces atomic limits of six Radar runs per minute and 100 per day for the permanent user.

## Collection reliability and diagnostics

Eligible sources run independently so one failed source does not discard records collected from another. Each source receives an 18-second collection budget and one bounded retry for transient timeouts, rate limits, network failures, and HTTP server errors. Configuration and validation failures are not retried. RSS and manual URL collectors stop promptly when the source-level budget is exhausted; YouTube requests share the same run signal while retaining their shorter request limit.

The compact **Collection health** panel stays collapsed during normal analysis. It exposes the latest run's retrieved, newly created, refreshed, and deduplicated counts; total duration; per-source duration, attempts, timeout or failure message, and last successful run; quota remaining after collection; cloud-persistence confirmation; and the five most recent run summaries. A run is visibly labelled partial when one source fails and another succeeds. These diagnostics report collection mechanics only and make no claim about market-wide coverage.

Deduplication uses the normalized `(platform, external_id)` identity before persistence. The database then checks existing `(source_id, external_id)` records before the idempotent upsert, allowing run history to distinguish new records from refreshed records without treating an update as a second mention.

## Normalized mentions

All connector records use the shared `RadarMention` / `NormalizedMention` contract: platform, external ID, source, author, content, optional URL, publication time, likes, comments, shares, views, normalized engagement, language, sentiment, topics, keywords, relevance, and metadata.

**Open original** is enabled only when a genuine source URL exists.

## Spike policy

A volume bin becomes a spike candidate only when it has at least four mentions and is at least 75% above its recent comparison baseline. The panel reports measured topics, sources, unusual keywords, and top-engagement mentions.

A likely driver is shown only when one topic accounts for at least 35% of the bin and two supporting mentions exist. The explanation links to those mentions. Otherwise Radar says **No clear driver identified.** These thresholds are transparent heuristics, not scientific or causal proof.

## Implemented connectors

- **RSS & Atom:** retrieves up to ten user-configured public feeds, parses recent entries, applies the monitor's transparent inclusion/exclusion rules, and preserves the original article URL.
- **Manual URL:** retrieves up to ten public pages selected by the user, extracts page metadata and article text, applies the monitor rules, and rejects local/private network targets and unsafe protocols.
- **YouTube:** uses `search.list` for recent matching videos, `videos.list` for public statistics, and `commentThreads.list` for public top-level comments. The API key stays in Function secrets.

Each source reports completed or failed independently, so one unavailable feed does not replace or invalidate genuine results from another source. No unsupported platform is presented as connected.

## Persistence boundary

Supabase is the source of truth for monitor definitions, collected mentions, topics, and run history. Stable client references make monitor and legacy run imports safe to retry. Reads use keyset pagination and currently hydrate the newest 5,000 conversations with an explicit truncation notice; older evidence remains in PostgreSQL. A cloud read failure produces a retry state instead of a misleading empty workspace. If connector persistence fails, retrieved records remain temporary in memory and the interface says they may be lost.

Older browser Radar payloads are never imported silently. Radar offers a JSON backup and reviewed import, verifies the cloud reload, and only then removes the corresponding local monitor, mention, run, note, saved-marker, important-marker, and evidence-link payloads. Radar annotations are stored per user in Supabase: `mention_notes` owns notes, `mentions.is_important` owns importance, and `saved_items` owns saved markers and evidence destinations.
