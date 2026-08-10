# Phase 6 Strategy AI acceptance record

Date: 10 August 2026

Accepted application baseline: `59823a4`

Outcome: **The evidence-grounded manual Strategy AI workflow is complete and accepted for current personal use.** The strategist confirmed that the deployed workflow works after the answer hierarchy and prompt were revised for clearer, everyday language. This acceptance is deliberately narrow: it confirms the current copy-to-ChatGPT, paste-to-Sift workflow is usable enough to move forward, not that every future model response will be equally useful or that structural citation validation proves semantic support.

## Accepted workflow

1. Choose a cloud-backed project and a genuine strategic question.
2. Retrieve an inspectable, RLS-scoped evidence set with stable source identities.
3. Review the retrieval tiers and deliberately select the sources allowed into the handoff.
4. Generate and inspect a prompt that keeps source evidence, capture-time interpretation, and later strategist notes separate.
5. Copy the prompt into the user's existing ChatGPT account without giving Sift a ChatGPT credential or paid API key.
6. Paste the structured response back into Sift.
7. Reject malformed output, uncited claims, duplicate citations, and citations outside the selected scope.
8. Revalidate project access and evidence eligibility before atomically storing the conversation, response, and citations.
9. Present the saved result as a straight answer followed by what the evidence shows, what it may mean, possible actions, uncertainty, and next questions.
10. Preserve the in-progress Strategy session while moving between Sift sections, while clearing it on sign-out or account change.

## Verification evidence

- The deterministic suite passes all 172 tests, including evidence retrieval, prompt construction, response parsing, citation scope, hostile source text, persistence boundaries, and the plain-language reading order.
- TypeScript, ESLint, and the optimized static production build pass.
- GitHub Pages workflow run 55 built and deployed commit `59823a4` successfully.
- The server remains authoritative for authenticated evidence revalidation and durable manual-handoff persistence.
- Direct browser writes to AI conversations and messages remain revoked.
- The strategist completed the current real-use checkpoint and confirmed that the revised workflow works for now.

## Boundaries retained after acceptance

- Sift validates structure, authorization, and citation identity. The strategist must still judge whether a source genuinely supports the wording of a claim.
- The accepted default path remains a deliberate manual ChatGPT handoff. It does not authorize automatic, scheduled, or background AI conclusions.
- General brainstorming is not presented or stored as workspace-backed analysis.
- Lexical full-text retrieval remains the default. Semantic retrieval stays deferred until evaluation demonstrates a real improvement.
- Clearer language is a continuing product quality requirement; this acceptance does not prevent future readability refinements.

## Next phase

Phase 7 begins with a project-scoped, editable insight builder that moves from observation to pattern, tension, insight, and opportunity while preserving evidence relationships, confidence, gaps, and alternative interpretations.
