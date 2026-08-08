import type { EvidenceDestination, RadarEvidenceLink, RadarMention } from "./types.ts";

export interface MentionNoteRow {
  id: string;
  project_id: string;
  mention_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface SavedMentionRow {
  id: string;
  project_id: string;
  item_id: string;
  destination: string;
  destination_id: string | null;
  note: string | null;
  source_excerpt: string | null;
  metadata: unknown;
  created_at: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function evidenceDestinationFromDatabase(value: string): EvidenceDestination | null {
  if (value === "insight_evidence") return "insight";
  if (value === "insight_seed") return "new-insight";
  if (["project", "research", "inspiration", "brief"].includes(value)) return value as EvidenceDestination;
  return null;
}

export function evidenceDestinationToDatabase(value: EvidenceDestination) {
  if (value === "insight") return "insight_evidence";
  if (value === "new-insight") return "insight_seed";
  return value;
}

export function evidenceLinkFromRow(row: SavedMentionRow, mention: RadarMention): RadarEvidenceLink | null {
  const destination = evidenceDestinationFromDatabase(row.destination);
  if (!destination) return null;
  const metadata = record(row.metadata);
  const destinationLabel = typeof metadata.destination_label === "string"
    ? metadata.destination_label
    : destination.replace("-", " ");
  const destinationId = typeof metadata.destination_client_ref === "string"
    ? metadata.destination_client_ref
    : undefined;
  return {
    id: row.id,
    cloudId: row.id,
    mentionId: mention.id,
    destination,
    destinationId,
    destinationCloudId: row.destination_id ?? undefined,
    destinationLabel,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}
