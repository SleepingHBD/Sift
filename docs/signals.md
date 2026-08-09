# Signals and analytical reasoning

Phase 5 introduces a deliberate layer between collected evidence and promoted trends. A Signal is a working observation or hypothesis that deserves investigation; it is not automatically a cultural truth, population-level finding, or recommendation.

## Current workflow

1. Open **Signals / Trends** and record a candidate inside a real project.
2. Choose **Working signal** for something directly observed, or **Hypothesis to test** for a possible explanation.
3. Keep the evidence-scope qualifier accurate. It is displayed on every card.
4. Move a useful candidate to **Watching**, return it to **Candidate**, or **Dismiss** it.
5. Select **Open analysis** to inspect the signal's evidence trail.
6. Search the signal's own project evidence and classify each original source as **Supports**, **Contradicts**, or **Adds context**. An optional rationale records exactly what the source contributes.
7. Open any linked source URL, change its role, edit its rationale, or remove only the relationship without deleting the original evidence.
8. Create a versioned directional assessment. Sift exposes its factor values, missing inputs, limitations, research gaps, and earlier snapshots.

The current increment deliberately does not auto-generate candidates, infer evidence relationships, invent unavailable growth, or promote a trend. The strategist chooses the evidence and its role. Every assessment remains a directional prioritisation aid rather than a finding.

## Data model

- `signals` stores the working claim, project, kind, status, movement, origin, scope qualifier, and strategist notes.
- `signal_evidence` links a signal to an original Radar mention, Research item, or Inspiration item as `support`, `contradict`, or `context`.
- `signal_snapshots` appends versioned assessments. Authenticated clients have no update or delete grant on this table.
- Existing `topics`, `mention_topics`, `trends`, and `trend_mentions` remain unchanged. A signal does not become a trend merely because it was created.

All three new tables have Row Level Security, require a permanent authenticated account, and are restricted to accessible projects. Composite foreign keys and write-time checks prevent cross-project signal, topic, and evidence links. Anonymous users have no grants.

Signal-linked Radar mentions are protected from scheduled retention. Signal citations also appear as blocking relationships in guarded evidence deletion, so a strategist must deliberately remove the citation before removing the source.

## Assessment contract

The deterministic `signal-heuristic-v1` produces a directional prioritisation aid, not a scientific score. It considers:

- number of supporting and contradicting sources;
- source and author diversity;
- comparison-window growth when available;
- recency when available;
- the previous versioned assessment when determining movement.

It always returns evidence sufficiency, transparent factor values, limitations, research gaps, and a population-scope disclaimer. Missing growth or recency stays missing. Contradictory evidence can reduce strength or set movement to `contradictory`.

## Evidence-linking rules

- Evidence search is restricted to original records owned by the signal's project. A source merely associated with another project is not silently copied across project boundaries.
- The original Radar, Research, or Inspiration record remains the source of truth. Removing a signal relationship does not delete that source.
- A signal can show support, contradiction, and contextual material together. Contradiction is not hidden and reduces the deterministic assessment.
- Assessment snapshots are append-only. Reassessment creates history instead of rewriting an earlier result.
- Growth remains unavailable until a defensible comparison-window input exists.

## Next increment

Add strategist-controlled topic and signal correction before promotion:

- rename and annotate signals without losing their history;
- merge or split related working signals while preserving source provenance;
- add explicit evidence-sufficiency gates before a signal may become an observed trend;
- keep promotion a deliberate strategist action with visible unmet requirements.
