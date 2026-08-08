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

## Monitor definitions

The default monitor form asks only for a topic and monitor name. An optional advanced editor supports `AND`, `OR`, `NOT`, exact phrases, parentheses, exclusions, project context, language, market, and requested sources.

New monitor definitions persist immediately to the authenticated Supabase workspace and start with no records. A run invokes the JWT-protected connector function, writes normalized evidence and an auditable run to PostgreSQL through Row Level Security, then reloads the authoritative cloud rows. The server enforces atomic limits of six Radar runs per minute and 100 per day for the permanent user.

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
