import type { RadarMention } from "../radar/types.ts";
import type { EvidenceReviewStatus, InspirationItem, ResearchItem, Sentiment } from "../types.ts";

export type EvidenceKind = "mention" | "research" | "inspiration";
export type EvidenceCaptureMethod = "connector" | "url" | "manual" | "strategist" | "import" | "upload" | "unknown";
export type { EvidenceReviewStatus } from "../types.ts";
export type EvidenceProcessingStatus = "unprocessed" | "pending" | "processed" | "failed";

export interface EvidenceAttachmentReference {
  id?: string;
  bucket?: string;
  path: string;
  name?: string;
  mimeType?: string;
  size?: number;
  kind?: "image" | "screenshot" | "document" | "other";
}

export interface EvidenceProvenance {
  captureMethod: EvidenceCaptureMethod;
  capturedAt: string;
  sourceRecordId?: string;
  connectorRunId?: string;
  importRunId?: string;
  contentHash?: string;
  metadata: Record<string, unknown>;
}

export interface EvidenceReferenceBase {
  id: string;
  cloudId?: string;
  clientRef?: string;
  projectId: string;
  projectClientRef?: string;
  kind: EvidenceKind;
  title: string;
  author: string | null;
  sourceLabel: string;
  originalUrl: string | null;
  canonicalUrl: string | null;
  originalContent: string | null;
  excerpt: string | null;
  publishedAt: string | null;
  capturedAt: string;
  notes: string | null;
  tags: string[];
  organizationTags: string[];
  organizationTopics: string[];
  topics: string[];
  associatedProjectIds: string[];
  language: string | null;
  processingStatus: EvidenceProcessingStatus;
  reviewStatus: EvidenceReviewStatus;
  reviewedAt: string | null;
  attachments: EvidenceAttachmentReference[];
  provenance: EvidenceProvenance;
}

export interface MentionEvidenceReference extends EvidenceReferenceBase {
  kind: "mention";
  monitorId: string;
  platform: RadarMention["platform"];
  externalId: string;
  engagement: number;
  sentiment: Sentiment;
}

export interface ResearchEvidenceReference extends EvidenceReferenceBase {
  kind: "research";
  itemType: string;
  collection: string;
  keyFindings: string | null;
  aiSummary: string | null;
}

export interface InspirationEvidenceReference extends EvidenceReferenceBase {
  kind: "inspiration";
  itemType: string;
  brand: string;
  thumbnailUrl: string | null;
}

export type EvidenceReference = MentionEvidenceReference | ResearchEvidenceReference | InspirationEvidenceReference;

export interface EvidenceReferenceContext {
  cloudProjectId?: string;
  projectClientRef?: string;
}

export interface EvidenceSearchRecord {
  kind: EvidenceKind;
  item_id: string;
  client_ref: string | null;
  project_id: string;
  project_name: string;
  title: string;
  author: string | null;
  source_label: string;
  original_url: string | null;
  canonical_url: string | null;
  original_content: string | null;
  published_at: string | null;
  captured_at: string;
  notes: string | null;
  source_tags: string[];
  organization_tags: string[];
  organization_topics: string[];
  topics: string[];
  associated_project_ids: string[];
  language: string | null;
  processing_status: EvidenceProcessingStatus;
  review_status: EvidenceReviewStatus;
  reviewed_at: string | null;
  attachments: unknown[];
  metadata: Record<string, unknown>;
  item_type: string | null;
  collection_name: string | null;
  key_findings: string | null;
  ai_summary: string | null;
  brand_name: string | null;
  thumbnail_url: string | null;
  monitor_id: string | null;
  platform: string | null;
  external_id: string;
  engagement: number;
  sentiment: string | null;
}

const captureMethods = new Set<EvidenceCaptureMethod>(["connector", "url", "manual", "strategist", "import", "upload", "unknown"]);
const reviewStatuses = new Set<EvidenceReviewStatus>(["unreviewed", "relevant", "irrelevant", "archived"]);
const processingStatuses = new Set<EvidenceProcessingStatus>(["unprocessed", "pending", "processed", "failed"]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function oneOf<T extends string>(value: unknown, allowed: Set<T>): T | undefined {
  return typeof value === "string" && allowed.has(value as T) ? value as T : undefined;
}

function excerpt(value: string | null, length = 320) {
  if (!value) return null;
  const clean = value.trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}

function inferCaptureMethod(metadata: Record<string, unknown>, fallback: EvidenceCaptureMethod) {
  const explicit = oneOf(metadata.capture_method ?? metadata.captureMethod, captureMethods);
  if (explicit) return explicit;
  const origin = text(metadata.sift_origin)?.toLowerCase();
  if (origin === "browser_import" || origin === "local_import") return "import";
  if (origin?.includes("strategist") || origin === "social_capture") return "strategist";
  if (origin?.includes("upload")) return "upload";
  return fallback;
}

function reviewStatus(metadata: Record<string, unknown>, explicit?: EvidenceReviewStatus) {
  return explicit ?? oneOf(metadata.review_status ?? metadata.reviewStatus, reviewStatuses) ?? "unreviewed";
}

function processingStatus(metadata: Record<string, unknown>, fallback: EvidenceProcessingStatus) {
  return oneOf(metadata.processing_status ?? metadata.processingStatus, processingStatuses) ?? fallback;
}

function attachmentReferences(value: unknown): EvidenceAttachmentReference[] {
  const values = Array.isArray(value) ? value : [];
  return values.flatMap((value) => {
    const item = record(value);
    const path = text(item.path);
    if (!path) return [];
    const kind = oneOf(item.kind, new Set(["image", "screenshot", "document", "other"] as const));
    return [{
      path,
      id: text(item.id),
      bucket: text(item.bucket),
      name: text(item.name),
      mimeType: text(item.mimeType ?? item.mime_type),
      size: typeof item.size === "number" && item.size >= 0 ? item.size : undefined,
      kind,
    }];
  });
}

function attachments(metadata: Record<string, unknown>): EvidenceAttachmentReference[] {
  return attachmentReferences(metadata.attachments);
}

function researchAttachments(item: ResearchItem, metadata: Record<string, unknown>): EvidenceAttachmentReference[] {
  const cloudAssets = (item.assets ?? []).map((asset): EvidenceAttachmentReference => ({
    id: asset.id,
    bucket: asset.bucketId,
    path: asset.storagePath,
    name: asset.originalFilename,
    mimeType: asset.mimeType,
    size: asset.byteSize,
    kind: asset.kind,
  }));
  return cloudAssets.length ? cloudAssets : attachments(metadata);
}

function provenance(
  metadata: Record<string, unknown>,
  fallbackMethod: EvidenceCaptureMethod,
  capturedAt: string,
  sourceRecordId?: string,
): EvidenceProvenance {
  return {
    captureMethod: inferCaptureMethod(metadata, fallbackMethod),
    capturedAt,
    sourceRecordId,
    connectorRunId: text(metadata.connector_run_id ?? metadata.connectorRunId ?? metadata.monitor_run_id),
    importRunId: text(metadata.import_run_id ?? metadata.importRunId),
    contentHash: text(metadata.content_hash ?? metadata.contentHash),
    metadata,
  };
}

function canonicalUrl(metadata: Record<string, unknown>, originalUrl: string | null) {
  return text(metadata.canonical_url ?? metadata.canonicalUrl) ?? originalUrl;
}

function identity(
  id: string,
  cloudId: string | undefined,
  clientRef: string | undefined,
  projectClientRef: string | undefined,
  context: EvidenceReferenceContext,
) {
  const projectId = context.cloudProjectId ?? projectClientRef;
  if (!projectId) throw new Error("Evidence cannot be referenced without a project.");
  return {
    id: cloudId ?? id,
    cloudId,
    clientRef: clientRef ?? id,
    projectId,
    projectClientRef: context.cloudProjectId ? projectClientRef : undefined,
    organizationTags: [],
    associatedProjectIds: [projectId],
  };
}

export function radarMentionToEvidenceReference(
  mention: RadarMention,
  context: EvidenceReferenceContext = {},
): MentionEvidenceReference {
  const metadata = record(mention.metadata);
  const capturedAt = mention.createdAt ?? mention.publishedAt;
  const originalUrl = mention.url ?? null;
  const fallbackMethod: EvidenceCaptureMethod = mention.platform === "manual" ? "url" : "connector";
  return {
    ...identity(mention.id, mention.cloudId, mention.id, context.projectClientRef, {
      ...context,
      cloudProjectId: mention.cloudProjectId ?? context.cloudProjectId,
    }),
    kind: "mention",
    title: mention.author && mention.author !== "Unknown author" ? `${mention.sourceLabel} · ${mention.author}` : mention.sourceLabel,
    author: mention.author || null,
    sourceLabel: mention.sourceLabel,
    originalUrl,
    canonicalUrl: canonicalUrl(metadata, originalUrl),
    originalContent: mention.content,
    excerpt: excerpt(mention.content),
    publishedAt: mention.publishedAt,
    capturedAt,
    notes: text(metadata.strategist_note) ?? null,
    tags: [...mention.keywords],
    organizationTopics: [],
    topics: [...mention.topics],
    language: mention.language || null,
    processingStatus: processingStatus(metadata, "processed"),
    reviewStatus: reviewStatus(metadata, mention.reviewStatus),
    reviewedAt: mention.reviewedAt ?? null,
    attachments: attachments(metadata),
    provenance: provenance(metadata, fallbackMethod, capturedAt, mention.externalId),
    monitorId: mention.monitorId,
    platform: mention.platform,
    externalId: mention.externalId,
    engagement: mention.engagement,
    sentiment: mention.sentiment,
  };
}

export function researchItemToEvidenceReference(
  item: ResearchItem,
  context: EvidenceReferenceContext = {},
): ResearchEvidenceReference {
  const metadata = record(item.metadata);
  const capturedAt = item.createdAt ?? item.date;
  const originalUrl = item.url ?? null;
  const sourceText = text(metadata.source_text ?? metadata.sourceText ?? metadata.quoted_text ?? metadata.quotedText) ?? null;
  return {
    ...identity(item.id, item.cloudId, item.clientRef, item.projectId, context),
    kind: "research",
    title: item.title,
    author: item.author ?? null,
    sourceLabel: item.publication || "Personal research",
    originalUrl,
    canonicalUrl: canonicalUrl(metadata, originalUrl),
    originalContent: sourceText,
    excerpt: excerpt(sourceText),
    publishedAt: item.publishedAt ?? null,
    capturedAt,
    notes: item.notes ?? item.keyFindings ?? item.summary ?? null,
    tags: [...item.tags],
    organizationTopics: [],
    topics: [],
    language: text(metadata.language) ?? null,
    processingStatus: processingStatus(metadata, item.aiSummary ? "processed" : "unprocessed"),
    reviewStatus: reviewStatus(metadata, item.reviewStatus),
    reviewedAt: item.reviewedAt ?? null,
    attachments: researchAttachments(item, metadata),
    provenance: provenance(metadata, originalUrl ? "url" : "manual", capturedAt, item.cloudId),
    itemType: item.type,
    collection: item.collection,
    keyFindings: item.keyFindings ?? item.summary ?? null,
    aiSummary: item.aiSummary ?? null,
  };
}

export function inspirationItemToEvidenceReference(
  item: InspirationItem,
  context: EvidenceReferenceContext = {},
): InspirationEvidenceReference {
  const metadata = record(item.metadata);
  const capturedAt = item.createdAt ?? item.savedAt;
  const originalUrl = item.url ?? null;
  const originalContent = item.extractedText ?? text(metadata.source_text ?? metadata.sourceText) ?? null;
  return {
    ...identity(item.id, item.cloudId, item.clientRef, item.projectId, context),
    kind: "inspiration",
    title: item.title,
    author: text(metadata.author) ?? null,
    sourceLabel: item.source || "Personal inspiration",
    originalUrl,
    canonicalUrl: canonicalUrl(metadata, originalUrl),
    originalContent,
    excerpt: excerpt(originalContent),
    publishedAt: text(metadata.published_at ?? metadata.publishedAt) ?? null,
    capturedAt,
    notes: item.note || null,
    tags: [...item.tags],
    organizationTopics: [],
    topics: [],
    language: text(metadata.language) ?? null,
    processingStatus: processingStatus(metadata, originalContent ? "processed" : "unprocessed"),
    reviewStatus: reviewStatus(metadata, item.reviewStatus),
    reviewedAt: item.reviewedAt ?? null,
    attachments: attachments(metadata),
    provenance: provenance(metadata, originalUrl ? "url" : "manual", capturedAt, item.cloudId),
    itemType: item.type,
    brand: item.brand,
    thumbnailUrl: item.thumbnailUrl ?? null,
  };
}

function uniqueText(values: string[]) {
  const unique = new Map<string, string>();
  for (const value of values) {
    const clean = value.trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, clean);
  }
  return [...unique.values()];
}

function searchPlatform(value: string | null): RadarMention["platform"] {
  if (value === "manual_url" || value === "manual_note") return "manual";
  if (value === "blog") return "rss";
  if (value && ["reddit", "youtube", "rss", "news", "tiktok", "instagram", "facebook", "linkedin", "x"].includes(value)) {
    return value as RadarMention["platform"];
  }
  return "manual";
}

export function evidenceSearchRecordToReference(record: EvidenceSearchRecord): EvidenceReference {
  const metadata = record.metadata;
  const organizationTags = uniqueText(record.organization_tags);
  const organizationTopics = uniqueText(record.organization_topics);
  const base: EvidenceReferenceBase = {
    id: record.item_id,
    cloudId: record.item_id,
    clientRef: record.client_ref ?? record.item_id,
    projectId: record.project_id,
    kind: record.kind,
    title: record.title,
    author: record.author,
    sourceLabel: record.source_label,
    originalUrl: record.original_url,
    canonicalUrl: record.canonical_url ?? record.original_url,
    originalContent: record.original_content,
    excerpt: excerpt(record.original_content),
    publishedAt: record.published_at,
    capturedAt: record.captured_at,
    notes: record.notes,
    tags: uniqueText([...record.source_tags, ...organizationTags]),
    organizationTags,
    organizationTopics,
    topics: uniqueText(record.topics),
    associatedProjectIds: uniqueText([record.project_id, ...record.associated_project_ids]),
    language: record.language,
    processingStatus: processingStatus(metadata, record.processing_status),
    reviewStatus: reviewStatus(metadata, record.review_status),
    reviewedAt: record.reviewed_at,
    attachments: attachmentReferences(record.attachments),
    provenance: provenance(
      metadata,
      record.kind === "mention"
        ? searchPlatform(record.platform) === "manual" ? "url" : "connector"
        : record.original_url ? "url" : "manual",
      record.captured_at,
      record.external_id,
    ),
  };

  if (record.kind === "mention") {
    return {
      ...base,
      kind: "mention",
      monitorId: record.monitor_id ?? "",
      platform: searchPlatform(record.platform),
      externalId: record.external_id,
      engagement: Number(record.engagement),
      sentiment: record.sentiment === "positive" || record.sentiment === "negative" ? record.sentiment : "neutral",
    };
  }

  if (record.kind === "research") {
    return {
      ...base,
      kind: "research",
      itemType: record.item_type ?? "article",
      collection: record.collection_name ?? "Unsorted",
      keyFindings: record.key_findings,
      aiSummary: record.ai_summary,
    };
  }

  return {
    ...base,
    kind: "inspiration",
    itemType: record.item_type ?? "reference",
    brand: record.brand_name ?? "Personal workspace",
    thumbnailUrl: record.thumbnail_url,
  };
}
