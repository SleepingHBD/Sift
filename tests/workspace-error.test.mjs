import assert from "node:assert/strict";
import test from "node:test";
import { describeWorkspaceError } from "../lib/workspace-error.ts";

test("workspace errors identify offline failures without claiming a cloud change", () => {
  assert.equal(
    describeWorkspaceError(new Error("Failed to fetch"), true),
    "Sift is offline. Your cloud workspace was not changed. Reconnect and try again.",
  );
  assert.equal(
    describeWorkspaceError(new Error("Anything"), false),
    "Sift is offline. Your cloud workspace was not changed. Reconnect and try again.",
  );
});

test("workspace errors distinguish session and permission failures", () => {
  assert.equal(
    describeWorkspaceError(new Error("Project update was not permitted for the current account."), true),
    "Your session could not complete this cloud action. Sign in again or reload, then retry.",
  );
});

test("workspace errors preserve actionable domain messages", () => {
  assert.equal(
    describeWorkspaceError(new Error("The project could not be found."), true),
    "The project could not be found.",
  );
});
