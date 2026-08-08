import type {
  EvidenceInboxKindFilter,
  EvidenceInboxSort,
  EvidenceInboxView,
} from "./inbox.ts";
import {
  evidenceSearchRecordToReference,
  type EvidenceKind,
  type EvidenceProcessingStatus,
  type EvidenceReference,
  type EvidenceReviewStatus,
  type EvidenceSearchRecord,
} from "./reference.ts";
import { createBrowserSupabaseClient } from "../supabase/client.ts";
import type { Json } from "../supabase/database.types.ts";

const defaultPageSize = 50;
const maximumPageSize = 100;
const evidenceKinds = new Set<EvidenceKind>(["mention", "research", "inspiration"]);
const reviewStatuses = new Set<EvidenceReviewStatus>(["unreviewed", "relevant", "irrelevant", "archived"]);
const processingStatuses = new Set<EvidenceProcessingStatus>(["unprocessed", "pending", "processed", "failed"]);
const sorts = new Set<EvidenceInboxSort>(["newest", "oldest", "recently-reviewed", "source", "project"]);

interface RpcEvidenceRow {
  evidence: unknown;
  cursor_value: unknown;
}

interface EvidenceCursorValue {
  sort: EvidenceInboxSort;
  primary: string;
  secondary: string | null;
  key: string;
}

export interface EvidenceSearchRequest {
  search?: string;
  projectId?: string | null;
  kind?: EvidenceInboxKindFilter;
  view?: EvidenceInboxView;
  sort?: EvidenceInboxSort;
  cursor?: string | null;
  pageSize?: number;
  now?: Date;
}

export interface EvidenceSearchPage {
  items: EvidenceReference[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface EvidenceInboxStats {
  total: number;
  unreviewed: number;
  reviewed: number;
  kinds: number;
}

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.length ? value : null;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function evidenceRecord(value: unknown): EvidenceSearchRecord {
  const row = object(value);
  const kind = string(row.kind) as EvidenceKind;
  const itemId = string(row.item_id);
  const projectId = string(row.project_id);
  const capturedAt = string(row.captured_at);
  if (!evidenceKinds.has(kind) || !itemId || !projectId || !capturedAt) {
    throw new Error("Evidence search returned an incomplete source reference.");
  }

  const metadata = object(row.metadata);
  const processing = string(row.processing_status) as EvidenceProcessingStatus;
  const review = string(row.review_status) as EvidenceReviewStatus;
  return {
    kind,
    item_id: itemId,
    client_ref: nullableString(row.client_ref),
    project_id: projectId,
    project_name: string(row.project_name, "Project"),
    title: string(row.title, "Untitled evidence"),
    author: nullableString(row.author),
    source_label: string(row.source_label, "Saved source"),
    original_url: nullableString(row.original_url),
    canonical_url: nullableString(row.canonical_url),
    original_content: nullableString(row.original_content),
    published_at: nullableString(row.published_at),
    captured_at: capturedAt,
    notes: nullableString(row.notes),
    source_tags: strings(row.source_tags),
    organization_tags: strings(row.organization_tags),
    organization_topics: strings(row.organization_topics),
    topics: strings(row.topics),
    associated_project_ids: strings(row.associated_project_ids),
    language: nullableString(row.language),
    processing_status: processingStatuses.has(processing) ? processing : "unprocessed",
    review_status: reviewStatuses.has(review) ? review : "unreviewed",
    reviewed_at: nullableString(row.reviewed_at),
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    metadata,
    item_type: nullableString(row.item_type),
    collection_name: nullableString(row.collection_name),
    key_findings: nullableString(row.key_findings),
    ai_summary: nullableString(row.ai_summary),
    brand_name: nullableString(row.brand_name),
    thumbnail_url: nullableString(row.thumbnail_url),
    monitor_id: nullableString(row.monitor_id),
    platform: nullableString(row.platform),
    external_id: string(row.external_id, itemId),
    engagement: number(row.engagement),
    sentiment: nullableString(row.sentiment),
  };
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeEvidenceCursor(value: unknown) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export function decodeEvidenceCursor(value: string, expectedSort?: EvidenceInboxSort): EvidenceCursorValue {
  try {
    const parsed = object(JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))));
    const sort = string(parsed.sort) as EvidenceInboxSort;
    const primary = string(parsed.primary);
    const key = string(parsed.key);
    if (!sorts.has(sort) || !primary || !key || (expectedSort && sort !== expectedSort)) throw new Error();
    return { sort, primary, secondary: nullableString(parsed.secondary), key };
  } catch {
    throw new Error("The evidence page cursor is invalid or no longer matches this view.");
  }
}

function recentBoundary(now: Date) {
  return new Date(now.getTime() - (7 * 24 * 60 * 60 * 1_000)).toISOString();
}

export async function searchEvidencePage(request: EvidenceSearchRequest = {}): Promise<EvidenceSearchPage> {
  const client = requireClient();
  const sort = request.sort ?? "newest";
  const pageSize = Math.min(Math.max(Math.trunc(request.pageSize ?? defaultPageSize), 1), maximumPageSize);
  const cursor = request.cursor ? decodeEvidenceCursor(request.cursor, sort) : null;
  const view = request.view ?? "all";
  const { data, error } = await client.rpc("search_evidence_page", {
    p_search: request.search?.trim() || undefined,
    p_project_id: request.projectId || undefined,
    p_kind: request.kind && request.kind !== "all" ? request.kind : undefined,
    p_review_status: view === "needs-review" ? "unreviewed" : undefined,
    p_recent_after: view === "recent" ? recentBoundary(request.now ?? new Date()) : undefined,
    p_sort: sort,
    p_cursor: cursor ? { ...cursor } as unknown as Json : undefined,
    p_page_size: pageSize,
  });
  if (error) throw new Error(`Evidence search could not be loaded: ${error.message}`);

  const rows = (data ?? []) as RpcEvidenceRow[];
  const hasMore = rows.length > pageSize;
  const visible = rows.slice(0, pageSize);
  let records = visible.map((row) => evidenceRecord(row.evidence));
  const researchIds = records.flatMap((record) => record.kind === "research" ? [record.item_id] : []);
  if (researchIds.length) {
    const { data: workingNotes, error: workingNotesError } = await client
      .from("research_items")
      .select("id,notes")
      .in("id", researchIds);
    if (workingNotesError) throw new Error(`Working strategist notes could not be loaded: ${workingNotesError.message}`);
    const workingNotesById = new Map((workingNotes ?? []).map((row) => [row.id, row.notes]));
    records = records.map((record) => record.kind === "research"
      ? { ...record, notes: workingNotesById.get(record.item_id) ?? null }
      : record);
  }
  return {
    items: records.map((record) => evidenceSearchRecordToReference(record)),
    hasMore,
    nextCursor: hasMore && visible.length ? encodeEvidenceCursor(visible[visible.length - 1].cursor_value) : null,
  };
}

export async function getEvidenceInboxStats(projectId?: string | null): Promise<EvidenceInboxStats> {
  const client = requireClient();
  const { data, error } = await client.rpc("evidence_inbox_stats", { p_project_id: projectId || undefined }).single();
  if (error) throw new Error(`Evidence totals could not be loaded: ${error.message}`);
  return {
    total: number(data.total_count),
    unreviewed: number(data.unreviewed_count),
    reviewed: number(data.reviewed_count),
    kinds: number(data.kind_count),
  };
}
