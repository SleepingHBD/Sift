import assert from "node:assert/strict";
import test from "node:test";
import {
  evidenceIdentityKey,
  mapCsvEvidenceRows,
  parseCsv,
  suggestCsvMapping,
} from "../lib/evidence/csv-import.ts";

test("CSV parser preserves quoted commas, escaped quotes, and line breaks", () => {
  const parsed = parseCsv('Title,Source text,Tags\r\n"A, B","First line\nSecond ""quoted"" line","culture; youth"');
  assert.deepEqual(parsed.headers, ["Title", "Source text", "Tags"]);
  assert.equal(parsed.rows[0]["Title"], "A, B");
  assert.equal(parsed.rows[0]["Source text"], 'First line\nSecond "quoted" line');
});

test("CSV parser rejects duplicate headers and unclosed quotes", () => {
  assert.throws(() => parseCsv("Title,title\nOne,Two"), /unique/);
  assert.throws(() => parseCsv('Title,Text\nOne,"unfinished'), /unclosed/);
});

test("mapping suggestions recognize common research-export headers", () => {
  const mapping = suggestCsvMapping(["Headline", "Link", "Publisher", "Why it matters", "Labels"]);
  assert.equal(mapping.title, "Headline");
  assert.equal(mapping.url, "Link");
  assert.equal(mapping.publication, "Publisher");
  assert.equal(mapping.keyFindings, "Why it matters");
  assert.equal(mapping.tags, "Labels");
});

test("mapped rows separate source text, notes, and strategic interpretation", () => {
  const parsed = parseCsv("Title,URL,Date,Excerpt,Notes,Why it matters,Tags\nSignal,https://example.com/post,08/08/2026,Source words,My note,Strategic value,Gen Z; Culture");
  const mapping = suggestCsvMapping(parsed.headers);
  const result = mapCsvEvidenceRows(parsed, mapping);
  assert.equal(result.validCount, 1);
  assert.equal(result.rows[0].title, "Signal");
  assert.equal(result.rows[0].url, "https://example.com/post");
  assert.equal(result.rows[0].publishedAt, "2026-08-08");
  assert.equal(result.rows[0].sourceText, "Source words");
  assert.equal(result.rows[0].notes, "My note");
  assert.equal(result.rows[0].keyFindings, "Strategic value");
  assert.deepEqual(result.rows[0].tags, ["Gen Z", "Culture"]);
});

test("validation reports bad URLs, missing titles, dates, and file duplicates", () => {
  const parsed = parseCsv("Title,URL,Date,Content\n,ftp://example.com,2026-99-99,First\nSame,https://example.com,2026-08-08,Copy\nSame,https://example.com,08/08/2026,Copy");
  const result = mapCsvEvidenceRows(parsed, suggestCsvMapping(parsed.headers));
  assert.equal(result.invalidCount, 1);
  assert.equal(result.duplicateCount, 1);
  assert.match(result.rows[0].errors.join(" "), /Title is required/);
  assert.match(result.rows[0].errors.join(" "), /http or https/);
  assert.equal(result.rows[2].duplicateRowNumber, 3);
});

test("identity keys normalize whitespace and case", () => {
  const first = evidenceIdentityKey({ title: " A Signal ", url: "HTTPS://EXAMPLE.COM", sourceText: "Two   words" });
  const second = evidenceIdentityKey({ title: "a signal", url: "https://example.com", sourceText: "two words" });
  assert.equal(first, second);
});
