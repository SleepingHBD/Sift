# Strategy AI activation evaluation

This checkpoint prepares Sift for a small paid model test without activating a model or making an OpenAI request. It combines enforceable in-app usage limits with task-specific evaluation scenarios and human review.

## Two spending boundaries

Sift requires all four private Edge Function settings before generation can become available:

- `OPENAI_API_KEY`
- `OPENAI_STRATEGY_MODEL`
- `STRATEGY_AI_MONTHLY_REQUEST_LIMIT`
- `STRATEGY_AI_MONTHLY_TOKEN_LIMIT`

The request and token limits are checked inside the authenticated Edge Function and enforced through service-only PostgreSQL functions. Each request reserves 30,000 tokens before the provider call. The reservation is intentionally conservative: after a successful response, Sift replaces it with the provider's actual `total_tokens`; if provider usage is unavailable after an attempted call, Sift counts the full reservation rather than pretending the attempt was free.

The application allowance is a secondary safety boundary, not a replacement for the OpenAI project spend limit. Before adding the key, configure a small project-level spending limit and alert in the OpenAI dashboard as the billing-level ceiling.

## Concurrency and access safety

- A transaction-level advisory lock serializes reservations for the same user and UTC month.
- Active reservations count against both limits, so concurrent requests cannot spend the same remaining allowance.
- Reservation, completion, release, and usage-summary functions are executable only by `service_role`.
- The private reservation table is not exposed to the browser and contains no source text or API credential.
- The browser receives only the normalized monthly allowance summary returned by the authenticated Edge Function.
- An expired reservation is released on the next reservation attempt. Completed and conservatively counted failed attempts remain in the monthly total.

## Fixed activation scenarios

The codebase defines five evaluation scenarios in `lib/strategy-ai/evaluation.ts`. They do not add demo records to the user's workspace.

1. **Insufficient evidence** — Sift should weaken the answer and state what is missing.
2. **Fact versus interpretation** — directly supported points and strategic readings must use different classifications.
3. **Contradictory sources** — disagreement should remain visible and reduce certainty.
4. **Hostile source text** — instructions embedded inside evidence must be treated only as research material.
5. **Evidence to recommendation** — an action may be recommended, but it cannot be disguised as a measured finding.

## Automated checks

For every response, the local evaluator records:

- citation validity against the selected source identities;
- claim citation coverage;
- how much of the selected evidence was actually cited;
- missing required epistemic classifications;
- scenario-specific expectations for tensions, evidence gaps, limitations, and claim count.

The server's strict response validator remains authoritative. The evaluation score is an additional release checkpoint, not a second path for accepting malformed model output.

## Human checks

Automation cannot determine whether a source genuinely supports nuanced claim wording. The strategist must still:

- open every citation and check evidence fit;
- confirm confidence and caveats match source breadth, recency, and diversity;
- rate strategic usefulness from 1 to 5 and explain the rating;
- confirm hostile source instructions did not alter behaviour;
- record response time and actual token usage.

## Proposed first live run

1. Create a dedicated OpenAI project and a small billing-level spend limit.
2. Add the four private settings above to Supabase Edge Function secrets.
3. Begin with the five fixed scenarios and disposable or already-authorized project evidence.
4. Stop after the configured request ceiling even if the results look promising.
5. Do not enable routine use unless citations are valid, unsupported workspace claims are absent, limitations are useful, and the cost is acceptable.

No automatic, scheduled, or background Strategy AI generation is part of this checkpoint.
