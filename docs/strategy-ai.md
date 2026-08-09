# Evidence-grounded Strategy AI

Phase 6 begins with the evidence boundary, not model output. The first increment deliberately does not send data to OpenAI or generate a strategic conclusion.

## Current workflow

1. Open **Strategy AI**.
2. Choose one cloud-backed project. The project is both the research scope and authorization boundary.
3. Enter the real strategic question you want to investigate.
4. Select **Find relevant evidence**.
5. Inspect the transparent full-text search terms and every candidate source returned from the authorized project.
6. Remove any candidate that should not influence the future answer.
7. Open original links when available to confirm the underlying source.

Evidence marked `irrelevant` or `archived` is excluded from the preview. A preview separates original source text, the interpretation recorded when the source entered Sift, and later strategist notes. These layers must not be silently blended into one factual claim.

## Security boundary

- `strategy-ai` is a JWT-protected Supabase Edge Function.
- Project access is checked with the caller's authenticated, RLS-scoped Supabase client.
- Evidence retrieval reuses the existing `search_evidence_page` PostgreSQL full-text function; no service-role retrieval is used.
- The browser never receives a model credential or service-role key.
- Direct authenticated insert, update, and delete access to `ai_conversations` and `ai_messages` is revoked. Future messages, citations, model identifiers, and usage records will be written only by the trusted server path.
- Existing AI tables are reused rather than creating a duplicate conversation store.

The OpenAI API key will eventually be stored only as an Edge Function secret named `OPENAI_API_KEY`. It must never be placed in a `NEXT_PUBLIC_` variable, GitHub Pages bundle, database row, or repository file. Official OpenAI guidance requires API credentials to remain in a server environment or key-management service.

## Current limitations

- Retrieval is lexical full-text search; semantic/vector retrieval remains deferred until retrieval evaluation proves it useful.
- The preview does not yet persist a conversation.
- The preview does not call OpenAI.
- The disabled analysis action is intentional and labelled honestly.

The next increment will revalidate the strategist's selected stable evidence identities inside the Edge Function, call the OpenAI Responses API with a bounded structured-output schema, reject unsupported workspace claims, and persist model, citations, structured claims, request ID, and token usage.

## Foundation verification

- The Phase 6 migration is applied to the linked Supabase project and the JWT-protected `strategy-ai` Edge Function is active.
- An unauthenticated function request returns `401`.
- A rollback-only database test confirmed that authenticated users can read only their own AI conversations and cannot write AI rows directly.
- Authenticated browser checks confirmed the honest empty state, a matched project source, source selection and deselection, and the intentionally disabled analysis action.
- The temporary browser-test source was deleted after verification and its remaining database count was confirmed as zero.
- The final quality gate passed: 149 automated tests, TypeScript checking, ESLint, and the Next.js production build.
