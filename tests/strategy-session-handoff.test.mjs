import assert from "node:assert/strict";
import test from "node:test";
import { strategyPieceLabels, strategySessionHandoffQuestion } from "../lib/strategy-pipeline/conversation.ts";

test("the handoff focus is derived from recent strategist turns without another required form", () => {
  const question = strategySessionHandoffQuestion({
    id: "session-1",
    projectId: "project-1",
    title: "Why do smaller communities feel different?",
    status: "active",
    origin: "strategist",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    stages: [],
    inputs: [],
    pieces: [],
    turns: [
      { id: "1", projectId: "project-1", sessionId: "session-1", role: "user", origin: "strategist", content: "People keep mentioning trust.", metadata: {}, aiMessageId: null, createdBy: "user-1", createdAt: "2026-08-10T00:00:00.000Z" },
      { id: "2", projectId: "project-1", sessionId: "session-1", role: "assistant", origin: "chatgpt_manual", content: "An earlier summary.", metadata: {}, aiMessageId: "message-1", createdBy: "user-1", createdAt: "2026-08-10T00:01:00.000Z" },
      { id: "3", projectId: "project-1", sessionId: "session-1", role: "user", origin: "strategist", content: "But reach still matters to organisers.", metadata: {}, aiMessageId: null, createdBy: "user-1", createdAt: "2026-08-10T00:02:00.000Z" },
    ],
  });

  assert.match(question, /unfinished strategy conversation/i);
  assert.match(question, /People keep mentioning trust/);
  assert.match(question, /reach still matters/);
  assert.doesNotMatch(question, /An earlier summary/);
  assert.ok(question.length <= 1000);
});

test("working pieces use plain-language labels", () => {
  assert.equal(strategyPieceLabels.interpretation, "Possible meaning");
  assert.equal(strategyPieceLabels.question, "Question to explore");
  assert.equal(strategyPieceLabels.opportunity, "Opportunity");
});
