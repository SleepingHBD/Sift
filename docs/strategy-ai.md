# Evidence-grounded Strategy AI

Phase 6 begins with the evidence boundary, not model output. Sift now has a complete model-ready structured-analysis path, but live generation remains deliberately unconfigured until a model and server-side key are explicitly chosen.

## Current workflow

1. Open **Strategy AI**.
2. Choose one cloud-backed project. The project is both the research scope and authorization boundary.
3. Enter the real strategic question you want to investigate.
4. Select **Find relevant evidence**.
5. Inspect the transparent full-text search terms and every candidate source returned from the authorized project.
6. Remove any candidate that should not influence the future answer.
7. Open original links when available to confirm the underlying source.
8. After model activation, generate a structured answer whose claims link back to the selected source cards.

Evidence marked `irrelevant` or `archived` is excluded from the preview. A preview separates original source text, the interpretation recorded when the source entered Sift, and later strategist notes. These layers must not be silently blended into one factual claim.

## Security boundary

- `strategy-ai` is a JWT-protected Supabase Edge Function.
- Project access is checked with the caller's authenticated, RLS-scoped Supabase client.
- Evidence preview reuses the existing `search_evidence_page` PostgreSQL full-text function; no service-role retrieval is used.
- Analysis re-resolves every selected stable identity under the caller's RLS context before any model request is allowed.
- The browser never receives a model credential or service-role key.
- Direct authenticated insert, update, and delete access to `ai_conversations` and `ai_messages` is revoked. Messages, citations, model identifiers, and usage records are written only through an atomic service-only database function after validation.
- Existing AI tables are reused rather than creating a duplicate conversation store.
- A client request ID makes safe retries idempotent, while changed or missing source scopes are rejected before generation.

Model activation requires two Edge Function secrets: `OPENAI_API_KEY` and `OPENAI_STRATEGY_MODEL`. They must never be placed in a `NEXT_PUBLIC_` variable, GitHub Pages bundle, database row, or repository file. No default model is silently selected.

## Response contract

- Each claim is classified as `measured_fact`, `interpretation`, `hypothesis`, or `recommendation`.
- Every claim and tension must cite one or more stable identities from the strategist-selected evidence scope.
- Confidence is limited to `high`, `medium`, or `low`, and every claim carries a caveat.
- The response also separates tensions, evidence gaps, suggested next questions, and limitations.
- Unknown, duplicate, missing, inaccessible, or changed evidence identities cause the response to be rejected rather than stored.
- Source content and notes are treated as untrusted research material, not executable model instructions.
- The provider request uses a strict JSON schema, a bounded evidence scope, a 45-second timeout, no automatic retry, and `store: false`.

## Current limitations

- Retrieval is lexical full-text search; semantic/vector retrieval remains deferred until retrieval evaluation proves it useful.
- The preview does not call OpenAI.
- The deployed environment currently has no activated model configuration, so the analysis action is intentionally disabled and labelled honestly.
- The structured path is model-ready, but it is not considered production-ready until a real evaluation set passes citation-validity, unsupported-claim, usefulness, and cost checks.
- General brainstorming is not yet implemented and cannot be mistaken for workspace-backed analysis.

## Foundation verification

- The Phase 6 migration is applied to the linked Supabase project and the JWT-protected `strategy-ai` Edge Function is active.
- An unauthenticated function request returns `401`.
- A rollback-only database test confirmed RLS-scoped identity resolution, service-only atomic persistence, and direct-write denial for authenticated browser clients.
- Authenticated browser checks confirmed the honest empty state, a newly captured matched project source, exact source selection, and the intentionally disabled analysis action.
- The temporary browser-test source was deleted after verification and its remaining database count was confirmed as zero.
- Deterministic fixtures test request validation, strict provider formatting, prompt-injection boundaries, citation rejection, response parsing, and usage normalization without making a paid model call.
- The final quality gate covers 154 automated tests, TypeScript checking, ESLint, and the Next.js production build.

## Next activation checkpoint

Choose one structured-output-capable model, add both server secrets, run a small fixed evaluation set with explicit spend limits, inspect every citation, and confirm stored usage before making generation generally available. Automatic or scheduled AI analysis remains out of scope until manual requests are reliable and affordable.
