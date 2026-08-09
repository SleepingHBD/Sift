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

Connector configuration remains separate from monitor configuration. The Sources drawer controls workspace-level RSS feeds, public page URLs, and YouTube availability; the monitor only narrows which configured sources are eligible. These non-secret settings now sync to the authenticated monitor projects through `connector_configs`, so a trusted server run does not depend on one browser's local storage. API credentials remain Edge Function secrets. Leaving the monitor's source scope empty means "use every configured permitted source", not "search every platform".

The shared coverage model reports each source as **Ready**, **Needs setup**, **Backend setup**, **Not included**, or **Unavailable**. It names the collection method, configuration state, and retrievable record types. Unsupported Reddit and news access cannot be enabled, and Instagram, TikTok, LinkedIn, Facebook, and X remain strategist-capture inputs rather than connector-collected data.

New monitor definitions persist immediately to the authenticated Supabase workspace and start with no records. Updates target both the monitor ID and its original project ID under the existing project-access Row Level Security policy. A run invokes the JWT-protected connector function, writes normalized evidence and an auditable run to PostgreSQL through Row Level Security, then reloads the authoritative cloud rows. The server enforces atomic limits of six Radar runs per minute and 100 per day for the permanent user.

## Collection reliability and diagnostics

Eligible sources run independently so one failed source does not discard records collected from another. Each source receives an 18-second collection budget and one bounded retry for transient timeouts, rate limits, network failures, and HTTP server errors. Configuration and validation failures are not retried. RSS and manual URL collectors stop promptly when the source-level budget is exhausted; YouTube requests share the same run signal while retaining their shorter request limit.

The compact **Collection health** panel stays collapsed during normal analysis. It exposes the latest run's retrieved, newly created, refreshed, and deduplicated counts; total duration; per-source duration, attempts, timeout or failure message, and last successful run; quota remaining after collection; cloud-persistence confirmation; and the five most recent run summaries. A run is visibly labelled partial when one source fails and another succeeds. These diagnostics report collection mechanics only and make no claim about market-wide coverage.

Deduplication uses the normalized `(platform, external_id)` identity before persistence. The database then checks existing `(source_id, external_id)` records before the idempotent upsert, allowing run history to distinguish new records from refreshed records without treating an update as a second mention.

### Execution safety and checkpoints

The connector function writes a `running` record before any network collection begins. PostgreSQL permits only one `running` row per monitor, so another tab or client cannot start an overlapping execution. Each run holds a three-minute lease; if the function stops before completing, the next attempt can mark that expired run failed and continue instead of leaving the monitor permanently locked.

Connector checkpoints are stored in `monitor_runs.cursor` and are accepted only when the monitor query, Boolean rules, language, and market are unchanged. RSS keeps a bounded set of previously observed entry identities per feed, and YouTube keeps a bounded set of previously observed video/comment identities. A successful connector advances only its own checkpoint. A failed connector retains its prior checkpoint, preventing partial failures from skipping evidence on the next run. Manual URLs deliberately perform a full refresh because a chosen page can change in place.

The trusted scheduling path is implemented and its production Vault and cron setup was explicitly activated and verified on 9 August 2026. Each monitor stores a manual, daily, or weekly schedule, preferred hour and weekday, browser time zone, last/next scheduled timestamps, consecutive failure count, and latest failure message. The database calculates the next wall-clock occurrence in the saved IANA time zone, and paused or manual monitors cannot remain scheduled.

`pg_cron` wakes a small dispatcher once per minute. `pg_net` invokes the JWT-protected `radar-scheduler` Edge Function using a legacy publishable JWT plus a second high-entropy token read from Supabase Vault. The token authorizes only a service-role RPC that atomically claims due monitors with `FOR UPDATE SKIP LOCKED`; callers cannot nominate an arbitrary monitor. Claims expire after five minutes, scheduled collection reuses the exact manual-run pipeline, and finalization advances the next occurrence. A failed attempt retries after a bounded delay and returns to the normal recurrence after three consecutive failures. Source quotas and the one-active-run database constraint continue to apply.

The interface asks the authenticated `radar_scheduler_status` RPC whether the cron job and required Vault records are present. Daily or weekly choices remain off and are labelled unavailable when that check fails. Cron activation remains deliberately separate from schema deployment because it authorizes unattended external requests; the active production job returns cleanly without collection when no eligible monitor is due.

Retention is explicitly opt-in and remains off for every existing and newly created monitor. A saved monitor can preview a 90-day, 180-day, or 365-day cutoff through the authenticated RLS-invoker `radar_retention_preview` function. Automatic enforcement becomes available only when the monitor is active, scheduled daily or weekly, has a finite retention window, and the strategist checks **Enable automatic retention**. Pausing the monitor, switching to manual collection, or choosing **Forever** disables enforcement automatically.

After a successful scheduled collection, `radar-scheduler` may call the service-role-only `enforce_radar_retention` function. One call removes at most 250 eligible conversations and records candidate, protected, deleted, and remaining counts in `radar_retention_runs` without copying deleted source text. Important or reviewed conversations and records linked through notes, saved destinations, tags, strategist topics, insights, briefs, or trends are protected. Row locks plus advisory locks coordinate cleanup with new polymorphic evidence relationships, so a citation cannot be inserted against a conversation being removed. Retention failure is reported separately and never changes an otherwise successful collection run into a failed one.

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

Supabase is the source of truth for monitor definitions, collected mentions, topics, and run history. Stable client references make monitor and legacy run imports safe to retry. The authenticated `radar_monitor_summary` function calculates headline metrics, source representation, observed date span, run freshness, and selected-topic scope across the complete authorized monitor history. The companion `radar_monitor_analysis` function calculates volume and sentiment timelines, topics, keywords, and evidence-linked spikes across the same RLS-scoped history. Both are security-invoker routines unavailable to anonymous callers. If either aggregate read fails, Radar explicitly falls back to the conversation history loaded in the browser. Detailed conversation browsing uses stable server-side keyset cursors with search, source, sentiment, topic, keyword, engagement, and sort filters. Topic and spike panels retrieve supporting records directly by authorized database identity, so an aggregate can open evidence outside the currently visible page. If connector persistence fails, retrieved records remain temporary in memory and the interface says they may be lost.

Older browser Radar payloads are never imported silently. Radar offers a JSON backup and reviewed import, verifies the cloud reload, and only then removes the corresponding local monitor, mention, run, note, saved-marker, important-marker, and evidence-link payloads. Radar annotations are stored per user in Supabase: `mention_notes` owns notes, `mentions.is_important` owns importance, and `saved_items` owns saved markers and evidence destinations.
