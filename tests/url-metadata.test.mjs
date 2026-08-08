import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicUrl, isBlockedHostname } from "../supabase/functions/_shared/security.ts";
import { comparableUrl, metadataFromHtml } from "../supabase/functions/_shared/url-metadata.ts";

test("URL metadata extraction preserves provenance and uses declared page metadata", () => {
  const html = `
    <html><head>
      <title>Fallback title</title>
      <meta property="og:title" content="A cultural shift &amp; why it matters">
      <meta name="description" content="A useful page description.">
      <meta name="author" content="Alex Researcher">
      <meta property="og:site_name" content="Signal Review">
      <meta property="article:published_time" content="2026-08-07T10:00:00+08:00">
      <meta property="og:image" content="/images/preview.jpg">
      <link href="/canonical-story?utm_source=newsletter" rel="canonical">
    </head></html>`;

  const metadata = metadataFromHtml(
    html,
    "https://example.com/shared-link",
    "https://example.com/story",
    () => new Date("2026-08-08T03:00:00.000Z"),
  );

  assert.equal(metadata.originalUrl, "https://example.com/shared-link");
  assert.equal(metadata.finalUrl, "https://example.com/story");
  assert.equal(metadata.canonicalUrl, "https://example.com/canonical-story?utm_source=newsletter");
  assert.equal(metadata.title, "A cultural shift & why it matters");
  assert.equal(metadata.description, "A useful page description.");
  assert.equal(metadata.author, "Alex Researcher");
  assert.equal(metadata.publication, "Signal Review");
  assert.equal(metadata.publishedAt, "2026-08-07T02:00:00.000Z");
  assert.equal(metadata.previewImage, "https://example.com/images/preview.jpg");
  assert.equal(metadata.extractedAt, "2026-08-08T03:00:00.000Z");
});

test("URL comparison removes common tracking parameters without discarding meaningful query state", () => {
  assert.equal(
    comparableUrl("https://EXAMPLE.com/story/?utm_source=feed&edition=sg#comments"),
    "https://example.com/story?edition=sg",
  );
});

test("public URL validation blocks credentials and local or private network targets", () => {
  assert.throws(() => assertPublicUrl("https://person:secret@example.com"), /credentials/);
  assert.throws(() => assertPublicUrl("http://127.0.0.1/admin"), /Private or local/);
  assert.throws(() => assertPublicUrl("http://[::1]/admin"), /Private or local/);
  assert.equal(isBlockedHostname("10.0.0.4"), true);
  assert.equal(isBlockedHostname("169.254.169.254"), true);
  assert.equal(isBlockedHostname("example.com"), false);
});
