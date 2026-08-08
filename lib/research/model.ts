import { stringArrayFromMetadata, stringFromMetadata } from "../evidence/source.ts";
import type { EvidenceAsset, ResearchItem } from "../types.ts";

export interface EvidenceAssetRow {
  id: string;
  project_id: string;
  research_item_id: string;
  bucket_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  asset_kind: "image" | "document";
  processing_status: "pending" | "ready" | "failed";
  created_at: string;
}

export interface ResearchRow {
  id: string;
  client_ref: string | null;
  project_id: string;
  title: string;
  url: string | null;
  author: string | null;
  publication: string | null;
  published_at: string | null;
  item_type: string;
  key_findings: string | null;
  notes: string | null;
  ai_summary: string | null;
  collection_name: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  evidence_assets?: EvidenceAssetRow[] | null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function researchFromRow(row: ResearchRow, projectClientRef: string): ResearchItem {
  const clientRef = row.client_ref ?? row.id;
  return {
    id: clientRef,
    cloudId: row.id,
    clientRef,
    projectId: projectClientRef,
    title: row.title,
    publication: row.publication ?? row.url ?? (stringFromMetadata(row.metadata, "source_label") || "Personal research"),
    url: row.url ?? undefined,
    type: row.item_type,
    date: formatDate(row.created_at),
    tags: stringArrayFromMetadata(row.metadata, "tags"),
    summary: row.key_findings ?? row.notes ?? "",
    collection: row.collection_name ?? "Unsorted",
    author: row.author ?? undefined,
    publishedAt: row.published_at ?? undefined,
    notes: row.notes ?? undefined,
    keyFindings: row.key_findings ?? undefined,
    aiSummary: row.ai_summary ?? undefined,
    assets: (row.evidence_assets ?? []).map((asset): EvidenceAsset => ({
      id: asset.id,
      projectId: projectClientRef,
      researchItemId: row.id,
      bucketId: asset.bucket_id,
      storagePath: asset.storage_path,
      originalFilename: asset.original_filename,
      mimeType: asset.mime_type,
      byteSize: asset.byte_size,
      kind: asset.asset_kind,
      processingStatus: asset.processing_status,
      createdAt: asset.created_at,
    })),
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createResearchClientRef(randomUuid = () => crypto.randomUUID()) {
  return `research-${randomUuid()}`;
}
