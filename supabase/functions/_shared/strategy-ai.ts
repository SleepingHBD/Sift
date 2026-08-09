export const STRATEGY_EVIDENCE_LIMIT = 12;
export const STRATEGY_QUESTION_LIMIT = 1_000;

const evidenceKinds = new Set(["mention", "research", "inspiration"]);
const excludedReviewStatuses = new Set(["irrelevant", "archived"]);
const stopWords = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "because", "but", "by",
  "can", "could", "did", "do", "does", "for", "from", "how", "i", "in", "is", "it",
  "may", "of", "on", "or", "our", "should", "that", "the", "their", "this", "to", "us",
  "was", "were", "what", "when", "where", "which", "who", "why", "with", "would",
]);

export interface StrategyEvidencePreviewRequest {
  action: "preview-evidence";
  projectId: string;
  question: string;
  limit: number;
}

export interface StrategyEvidencePreviewItem {
  identity: string;
  id: string;
  kind: "mention" | "research" | "inspiration";
  projectId: string;
  title: string;
  author: string | null;
  sourceLabel: string;
  originalUrl: string | null;
  sourceExcerpt: string | null;
  initialInterpretation: string | null;
  strategistNotes: string | null;
  capturedAt: string;
  reviewStatus: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function excerpt(value: unknown, maximum = 520) {
  const clean = text(value).replace(/\s+/g, " ");
  if (!clean) return null;
  return clean.length > maximum ? `${clean.slice(0, maximum - 1).trimEnd()}…` : clean;
}

export function validateStrategyEvidencePreviewRequest(value: unknown): StrategyEvidencePreviewRequest {
  const candidate = record(value);
  const projectId = text(candidate.projectId);
  const question = text(candidate.question);
  const requestedLimit = Math.trunc(Number(candidate.limit) || 8);

  if (candidate.action !== "preview-evidence") throw new Error("The Strategy AI action is not supported.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error("Choose a valid project before searching for evidence.");
  }
  if (question.length < 3) throw new Error("Enter a strategic question before searching for evidence.");
  if (question.length > STRATEGY_QUESTION_LIMIT) throw new Error(`Keep the strategic question under ${STRATEGY_QUESTION_LIMIT.toLocaleString()} characters.`);

  return {
    action: "preview-evidence",
    projectId,
    question,
    limit: Math.min(Math.max(requestedLimit, 1), STRATEGY_EVIDENCE_LIMIT),
  };
}

export function strategyEvidenceSearchText(question: string) {
  const quoted = [...question.matchAll(/"([^"]{2,80})"/g)].map((match) => match[1].trim());
  const words = question
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[-']+|[-']+$/g, ""))
    .filter((word) => word.length > 1 && !stopWords.has(word));
  const unique = [...new Set([...quoted, ...words])].slice(0, 10);
  return unique.join(" ") || question.trim();
}

export function normalizeStrategyEvidenceRow(value: unknown): StrategyEvidencePreviewItem | null {
  const row = record(value);
  const evidence = record(row.evidence ?? value);
  const kind = text(evidence.kind);
  const id = text(evidence.item_id);
  const projectId = text(evidence.project_id);
  const capturedAt = text(evidence.captured_at);
  const reviewStatus = text(evidence.review_status) || "unreviewed";
  if (!evidenceKinds.has(kind) || !id || !projectId || !capturedAt || excludedReviewStatuses.has(reviewStatus)) return null;

  const metadata = record(evidence.metadata);
  const initialInterpretation = kind === "research"
    ? excerpt(evidence.key_findings)
    : excerpt(metadata.initial_interpretation ?? metadata.initialInterpretation);

  return {
    identity: `${kind}:${id}`,
    id,
    kind: kind as StrategyEvidencePreviewItem["kind"],
    projectId,
    title: text(evidence.title) || "Untitled evidence",
    author: nullableText(evidence.author),
    sourceLabel: text(evidence.source_label) || "Saved source",
    originalUrl: nullableText(evidence.original_url),
    sourceExcerpt: excerpt(evidence.original_content),
    initialInterpretation,
    strategistNotes: excerpt(evidence.notes),
    capturedAt,
    reviewStatus,
  };
}
