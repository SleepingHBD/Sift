# Evidence-grounded Strategy AI

Phase 6 uses a deliberate ChatGPT handoff instead of a paid model API. Sift retrieves and scopes private workspace evidence, prepares a visible citation-ready prompt, and validates the response when the strategist brings it back. Sift never receives the user's ChatGPT password, session, subscription credential, or API key.

Status: **Complete and accepted for the current manual workflow.** See [phase-6-acceptance.md](phase-6-acceptance.md).

## Current workflow

1. Open **Strategy AI**.
2. Choose one cloud-backed project. The project is both the research scope and authorization boundary.
3. Choose a thinking task: evidence analysis, tensions, insights, or opportunities.
4. Enter the real strategic question.
5. Select **Find relevant evidence**.
6. Inspect the transparent full-text search and every candidate source returned from the authorized project.
7. Remove any candidate that should not influence the answer and open original links when useful.
8. Select **Prepare ChatGPT handoff**.
9. Review the complete prompt, then copy it and open ChatGPT.
10. Paste the prompt into ChatGPT using the user's existing account.
11. Copy ChatGPT's JSON response back into Sift.
12. Select **Validate and save analysis**.
13. Read the plain-language answer first, then inspect what the evidence shows, what it may mean, possible actions, uncertainty, and source citations.

Evidence marked `irrelevant` or `archived` is excluded. The handoff preserves original source text, the interpretation recorded when the source entered Sift, and later strategist notes as separate fields.

## Deliberate data boundary

- Evidence stays in Sift until the strategist deliberately copies the prepared prompt.
- Nothing is sent to ChatGPT automatically.
- The prompt preview shows exactly which selected evidence will leave Sift.
- The interface warns against copying passwords, API keys, credentials, or material the strategist does not want processed in ChatGPT.
- Sift cannot verify which ChatGPT model produced the pasted response, so it records the provenance as `ChatGPT manual handoff` rather than claiming an exact model.
- No OpenAI API key, additional model billing, or ChatGPT credential is required by Sift's default workflow.

## Supabase security boundary

- `strategy-ai` remains a JWT-protected Supabase Edge Function.
- Project access is checked with the caller's authenticated, RLS-scoped Supabase client.
- Evidence retrieval reuses the existing `search_evidence_page` PostgreSQL full-text function; no service-role retrieval is used.
- Before an imported response can be stored, the function re-resolves every selected stable identity under the caller's RLS context.
- Client and server validators reject malformed output, unknown citations, duplicate citations, and citations outside the selected evidence scope.
- Direct authenticated insert, update, and delete access to `ai_conversations` and `ai_messages` remains revoked.
- Validated messages and citations are written atomically through the existing service-only persistence function after authentication, project access, evidence scope, and response structure have all been checked.
- The client cannot choose stored provider provenance or bypass the citation contract.

## Response contract

- The prompt requires a direct answer first, everyday language, short sentences, concrete wording, and an explanation for any unavoidable specialist term.
- The result interface presents the summary before the analytical machinery, then groups claims into what the evidence shows, what it may mean, and what the strategist could do.
- Each claim is classified as `measured_fact`, `interpretation`, `hypothesis`, or `recommendation`.
- Every claim and tension must cite one or more exact stable identities from the strategist-selected evidence scope.
- Confidence is limited to `high`, `medium`, or `low`, and every claim carries a caveat field.
- The response separately records tensions, evidence gaps, suggested next questions, and limitations.
- A response may contain no claims when the evidence is insufficient, but it must explain the gap.
- Source content and notes are explicitly presented to ChatGPT as untrusted research material, not instructions.

## Current limitations

- The handoff requires copy and paste; Sift cannot run ChatGPT automatically through the user's subscription.
- A successful structural validation proves that citations use selected IDs. It does not prove that the cited source semantically supports every word of a claim; the strategist must still review evidence fit.
- Retrieval is lexical full-text search. Semantic/vector retrieval remains deferred until evaluation proves it useful.
- ChatGPT can return prose or malformed JSON despite the prompt. Sift reports the problem and saves nothing until the response meets the contract.
- Automatic, scheduled, and background AI analysis remains unavailable.
- General brainstorming is not stored as workspace-backed analysis.

## Verification

- Deterministic tests cover prompt construction, exact source identities, separation of evidence layers, fenced JSON parsing, malformed output, and invented citations.
- Shared server tests cover bounded import requests, citation validation, project-scoped evidence revalidation, fixed manual provenance, and service-only persistence.
- Existing direct-write denial, RLS, and idempotency controls remain intact.
- See [strategy-ai-evaluation.md](strategy-ai-evaluation.md) for the short real-use acceptance checkpoint.

## Accepted checkpoint

The strategist confirmed the deployed manual workflow works for current use after the response was reorganized around a straight answer, evidence, interpretation, possible actions, uncertainty, and next steps. Phase 7 now builds the editable insight and strategy pipeline on top of this accepted evidence boundary.
