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

New monitor definitions persist to user-scoped browser storage and start with no records. A run requires the permanent GitHub-backed Supabase session, invokes the JWT-protected connector function, stores the normalized response locally, and writes the run and its evidence to PostgreSQL through Row Level Security. The server enforces atomic limits of six Radar runs per minute and 100 per day for the permanent user.

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

The static client keeps collected mentions in the current device's browser storage for immediate analysis. The authenticated Edge Function also maps client project and monitor references to UUID-backed PostgreSQL rows and persists sources, mentions, monitor runs, sentiment, keywords, topics, and topic relationships. If cloud persistence fails, the client explicitly reports that only device persistence succeeded.
