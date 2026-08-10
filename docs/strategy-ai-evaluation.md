# Strategy AI handoff evaluation

This checkpoint tests the manual ChatGPT handoff without activating an API model or adding API billing.

## Fixed scenarios

The codebase defines five evaluation scenarios in `lib/strategy-ai/evaluation.ts`. They describe the evidence shape to assemble and never add demo records to the user's workspace.

1. **Insufficient evidence** — ChatGPT should weaken the answer and state what is missing.
2. **Fact versus interpretation** — directly supported points and strategic readings must use different classifications.
3. **Contradictory sources** — disagreement should remain visible and reduce certainty.
4. **Hostile source text** — instructions embedded inside evidence must be treated only as research material.
5. **Evidence to recommendation** — an action may be recommended, but it cannot be disguised as a measured finding.

## Automated checks

For every pasted response, Sift checks:

- valid JSON and bounded field sizes;
- citation validity against the selected stable evidence identities;
- claim citation coverage;
- permitted fact, interpretation, hypothesis, and recommendation labels;
- permitted confidence values;
- scenario expectations for tensions, evidence gaps, limitations, and claim count;
- authenticated project access and unchanged evidence eligibility before storage.

The server validator remains authoritative. A response that fails is not stored.

## Human checks

Automation cannot determine whether a source genuinely supports nuanced claim wording. The strategist must still:

- open every citation and check evidence fit;
- confirm confidence and caveats match source breadth, recency, and diversity;
- rate strategic usefulness from 1 to 5 and explain the rating;
- confirm hostile source instructions did not alter ChatGPT's behaviour;
- verify that measured facts do not contain the strategist's interpretation;
- confirm the direct answer is understandable on its first reading and does not rely on unexplained jargon;
- remove weak evidence and run a fresh handoff when the scope changes.

## Real-use acceptance run

1. Use one real project and one genuine strategic question.
2. Retrieve evidence and deliberately remove at least one irrelevant candidate if available.
3. Review the generated prompt before copying it.
4. Run the prompt in ChatGPT using the existing subscription.
5. Paste the JSON response into Sift and save it.
6. Confirm the straight answer is clear, then open every stored citation and judge support, caveats, usefulness, and missing evidence.
7. Confirm a deliberately invented evidence ID is rejected in a disposable response.

Passing this checkpoint means the handoff is dependable enough for manual work. It does not authorize automatic or background AI analysis.
