import { stringFromMetadata } from "../evidence/source.ts";
import type { InspirationItem } from "../types.ts";

export interface InspirationRow {
  id: string;
  client_ref: string | null;
  project_id: string;
  title: string;
  item_type: string;
  url: string | null;
  thumbnail_url: string | null;
  brand_name: string | null;
  notes: string | null;
  extracted_text: string | null;
  auto_tags: string[];
  metadata: unknown;
  created_at: string;
  updated_at: string;
  review_status: "unreviewed" | "relevant" | "irrelevant" | "archived";
  reviewed_at: string | null;
}

const palettes = ["blue", "acid", "coral", "purple", "green"];

function stablePalette(value: string) {
  let hash = 0;
  for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return palettes[Math.abs(hash) % palettes.length];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function inspirationFromRow(row: InspirationRow, projectClientRef: string): InspirationItem {
  const clientRef = row.client_ref ?? row.id;
  return {
    id: clientRef,
    cloudId: row.id,
    clientRef,
    projectId: projectClientRef,
    brand: row.brand_name ?? "Personal workspace",
    title: row.title,
    type: row.item_type,
    source: row.url ?? (stringFromMetadata(row.metadata, "source_label") || "Personal note"),
    url: row.url ?? undefined,
    tags: row.auto_tags,
    palette: stringFromMetadata(row.metadata, "palette") || stablePalette(clientRef),
    savedAt: formatDate(row.created_at),
    note: row.notes ?? "",
    thumbnailUrl: row.thumbnail_url ?? undefined,
    extractedText: row.extracted_text ?? undefined,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewStatus: row.review_status,
    reviewedAt: row.reviewed_at ?? undefined,
  };
}

export function createInspirationClientRef(randomUuid = () => crypto.randomUUID()) {
  return `inspiration-${randomUuid()}`;
}
