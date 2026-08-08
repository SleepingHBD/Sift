import assert from "node:assert/strict";
import test from "node:test";
import { captureTitleFromUrl, normalizeCaptureUrl, prepareQuickCapture } from "../lib/evidence/capture.ts";

test("URL capture accepts a friendly address and prepares explicit provenance", () => {
  const result = prepareQuickCapture({
    mode: "url",
    projectId: "project-1",
    source: "www.example.com/article#section",
    note: "",
    title: "",
    whyItMatters: "A useful shift in behaviour.",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.source, "https://www.example.com/article");
  assert.equal(result.value.title, "example.com");
  assert.equal(result.value.captureMethod, "url");
  assert.equal(result.value.captureOrigin, "global_capture");
  assert.equal(result.value.summary, "A useful shift in behaviour.");
});

test("quick URL capture needs only a project and valid source", () => {
  const result = prepareQuickCapture({
    mode: "url",
    projectId: "project-1",
    source: "https://example.com",
    note: "",
    title: "",
    whyItMatters: "",
  });

  assert.equal(result.ok, true);
});

test("manual notes preserve original text separately from the initial interpretation", () => {
  const result = prepareQuickCapture({
    mode: "note",
    projectId: "project-1",
    source: "",
    note: "People are using the event as a place to make friends.\nA second line.",
    title: "",
    whyItMatters: "Community may be the real category benefit.",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.title, "People are using the event as a place to make friends.");
  assert.equal(result.value.sourceText, "People are using the event as a place to make friends.\nA second line.");
  assert.equal(result.value.summary, "Community may be the real category benefit.");
  assert.equal(result.value.captureMethod, "manual");
});

test("capture validation identifies the field that needs attention", () => {
  const urlResult = prepareQuickCapture({ mode: "url", projectId: "", source: "not a url", note: "", title: "", whyItMatters: "" });
  assert.deepEqual(urlResult, {
    ok: false,
    errors: {
      projectId: "Choose a project for this evidence.",
      source: "Enter a valid public web address.",
    },
  });

  const noteResult = prepareQuickCapture({ mode: "note", projectId: "project-1", source: "", note: " ", title: "", whyItMatters: "" });
  assert.deepEqual(noteResult, { ok: false, errors: { note: "Write or paste the note you want to preserve." } });
});

test("capture URLs reject credentials and unsupported protocols", () => {
  assert.equal(normalizeCaptureUrl("javascript:alert(1)"), null);
  assert.equal(normalizeCaptureUrl("https://person:secret@example.com"), null);
  assert.equal(captureTitleFromUrl("https://www.example.com/path"), "example.com");
});
