import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeStrategyEvidenceRow,
  strategyEvidenceSearchText,
  validateStrategyEvidencePreviewRequest,
} from "../supabase/functions/_shared/strategy-ai.ts";

const projectId = "11111111-1111-4111-8111-111111111111";

test("Strategy AI evidence preview validates and bounds the authenticated request", () => {
  const request = validateStrategyEvidencePreviewRequest({
    action: "preview-evidence",
    projectId,
    question: "  Why are smaller communities becoming more important?  ",
    limit: 99,
  });

  assert.equal(request.question, "Why are smaller communities becoming more important?");
  assert.equal(request.limit, 12);
  assert.throws(
    () => validateStrategyEvidencePreviewRequest({ action: "preview-evidence", projectId: "local-project", question: "Valid question" }),
    /valid project/i,
  );
  assert.throws(
    () => validateStrategyEvidencePreviewRequest({ action: "analyze", projectId, question: "Valid question" }),
    /not supported/i,
  );
});

test("Strategy AI derives inspectable search terms instead of hiding retrieval logic", () => {
  assert.equal(
    strategyEvidenceSearchText('Why are people talking about "trusted communities" in Singapore?'),
    "trusted communities people talking trusted communities singapore",
  );
});

test("Strategy AI keeps source evidence, initial interpretation, and later notes separate", () => {
  const item = normalizeStrategyEvidenceRow({
    evidence: {
      kind: "research",
      item_id: "22222222-2222-4222-8222-222222222222",
      project_id: projectId,
      title: "Community research note",
      author: "Strategist",
      source_label: "Field note",
      original_url: null,
      original_content: "Participants described preferring smaller, familiar online spaces.",
      key_findings: "Small communities may feel safer than large feeds.",
      notes: "Compare this with younger audiences before treating it as a broad shift.",
      captured_at: "2026-08-10T00:00:00.000Z",
      review_status: "relevant",
      metadata: {},
    },
  });

  assert.equal(item?.identity, "research:22222222-2222-4222-8222-222222222222");
  assert.equal(item?.sourceExcerpt, "Participants described preferring smaller, familiar online spaces.");
  assert.equal(item?.initialInterpretation, "Small communities may feel safer than large feeds.");
  assert.equal(item?.strategistNotes, "Compare this with younger audiences before treating it as a broad shift.");
});

test("Strategy AI retrieval preview excludes evidence the strategist marked irrelevant or archived", () => {
  const row = {
    kind: "mention",
    item_id: "33333333-3333-4333-8333-333333333333",
    project_id: projectId,
    title: "Old post",
    source_label: "Radar",
    captured_at: "2026-08-10T00:00:00.000Z",
    review_status: "archived",
  };
  assert.equal(normalizeStrategyEvidenceRow({ evidence: row }), null);
});
