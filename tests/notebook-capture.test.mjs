import assert from "node:assert/strict";
import test from "node:test";
import { findNotebookUrl } from "../lib/strategy-pipeline/notebook-capture.ts";

test("findNotebookUrl detects a public link inside an unfinished thought", () => {
  assert.equal(
    findNotebookUrl("This feels useful: https://example.com/article?ref=sift."),
    "https://example.com/article?ref=sift",
  );
});

test("findNotebookUrl accepts a www address and ignores normal prose", () => {
  assert.equal(findNotebookUrl("Save www.example.com/research"), "https://www.example.com/research");
  assert.equal(findNotebookUrl("I keep noticing smaller communities."), null);
});
