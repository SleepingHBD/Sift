import assert from "node:assert/strict";
import test from "node:test";
import {
  getSocialCaptureDetails,
  inferSocialPlatform,
  prepareSocialCapture,
  validateSocialScreenshot,
} from "../lib/evidence/social-capture.ts";

test("social capture infers known platforms without treating them as connectors", () => {
  assert.equal(inferSocialPlatform("instagram.com/p/example"), "Instagram");
  assert.equal(inferSocialPlatform("https://vm.tiktok.com/example"), "TikTok");
  assert.equal(inferSocialPlatform("https://twitter.com/account/status/1"), "X");
  assert.equal(inferSocialPlatform("https://example.com/post"), "Other");
});

test("social capture preserves entered source material and explicit strategist provenance", () => {
  const result = prepareSocialCapture({
    projectId: "project-1",
    source: "reddit.com/r/example/comments/123#comment",
    platform: "Reddit",
    author: "u/observer",
    caption: "People described this as a new way to meet friends.",
    selectedComments: "u/a: I joined for the community.",
    observedAt: "2026-08-08",
    title: "",
    whyItMatters: "The social benefit may be more important than the functional benefit.",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.source, "https://reddit.com/r/example/comments/123");
  assert.equal(result.value.title, "Reddit post · u/observer");
  assert.equal(result.value.captureMethod, "strategist");
  assert.equal(result.value.captureOrigin, "social_capture");
  assert.equal(result.value.caption, "People described this as a new way to meet friends.");
  assert.equal(result.value.selectedComments, "u/a: I joined for the community.");
});

test("social capture needs only a project and valid public post URL", () => {
  const result = prepareSocialCapture({
    projectId: "project-1",
    source: "https://www.youtube.com/watch?v=example",
    platform: "YouTube",
    author: "",
    caption: "",
    selectedComments: "",
    observedAt: "",
    title: "",
    whyItMatters: "",
  });
  assert.equal(result.ok, true);
});

test("social screenshots accept private image formats but reject documents", () => {
  assert.equal(validateSocialScreenshot({ name: "post.webp", type: "image/webp", size: 2_048 }).ok, true);
  assert.deepEqual(validateSocialScreenshot({ name: "post.pdf", type: "application/pdf", size: 2_048 }), {
    ok: false,
    error: "Use a JPG, PNG, or WebP screenshot.",
  });
});

test("social details are exposed only for explicitly labelled manual captures", () => {
  assert.equal(getSocialCaptureDetails({ capture_method: "connector", social_platform: "Instagram" }), null);
  assert.deepEqual(getSocialCaptureDetails({
    sift_origin: "social_capture",
    source_label: "Instagram",
    social_author: "@account",
    source_text: "Selected caption",
    selected_comments: "Selected response",
    observed_at: "2026-08-08",
  }), {
    platform: "Instagram",
    author: "@account",
    caption: "Selected caption",
    selectedComments: "Selected response",
    observedAt: "2026-08-08",
  });
});
