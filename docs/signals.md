# Signals and analytical reasoning

Phase 5 introduces a deliberate layer between collected evidence and promoted trends. A Signal is a working observation or hypothesis that deserves investigation; it is not automatically a cultural truth, population-level finding, or recommendation.

## Current workflow

1. Open **Signals / Trends** and record a candidate inside a real project.
2. Choose **Working signal** for something directly observed, or **Hypothesis to test** for a possible explanation.
3. Keep the evidence-scope qualifier accurate. It is displayed on every card.
4. Move a useful candidate to **Watching**, return it to **Candidate**, or **Dismiss** it.
5. Review the project's Evidence Inbox while deciding what should support, contradict, or contextualise the signal.

The current increment deliberately does not auto-generate candidates, attach evidence through the UI, calculate a score, or promote a trend. Those controls arrive through later Phase 5 increments after their evidence paths are inspectable.

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

## Next increment

Build the signal detail and evidence-linking workflow:

- search and attach authorized evidence as support, contradiction, or context;
- open every source from the signal;
- remove or reclassify a link deliberately;
- create and inspect a versioned assessment snapshot;
- show the factor breakdown, limitations, and research gaps before any promotion decision.
