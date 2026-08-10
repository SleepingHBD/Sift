import assert from "node:assert/strict";
import test from "node:test";
import { createStrategyWorkingSession } from "../lib/strategy-ai/session.ts";

test("a new Strategy AI working session is empty and scoped to its signed-in workspace", () => {
  const first = createStrategyWorkingSession("user-one", "project-one");
  const second = createStrategyWorkingSession("user-two", "project-two");

  assert.equal(first.workspaceUserId, "user-one");
  assert.equal(first.projectId, "project-one");
  assert.equal(first.question, "");
  assert.equal(first.preview, null);
  assert.equal(first.handoffPrompt, "");
  assert.equal(first.task, "analyse");
  assert.notEqual(first.selected, second.selected);
  assert.equal(second.workspaceUserId, "user-two");
});
