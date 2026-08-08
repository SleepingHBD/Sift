import type { EvidenceKind } from "./reference.ts";

export type EvidenceRelationshipType = "insight" | "brief" | "project" | "saved" | "tag" | "asset" | "note" | "trend";

export interface EvidenceIdentity {
  kind: EvidenceKind;
  itemId: string;
  projectId: string;
}

export interface EvidenceRelationship {
  type: EvidenceRelationshipType;
  id: string;
  targetId: string | null;
  targetProjectId: string | null;
  label: string;
  blocking: boolean;
  metadata: Record<string, unknown>;
}

export interface EvidenceRelationshipSummary {
  items: EvidenceRelationship[];
  blockingCount: number;
  removableCount: number;
}

export function summarizeEvidenceRelationships(items: EvidenceRelationship[]): EvidenceRelationshipSummary {
  const sorted = [...items].sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
  return {
    items: sorted,
    blockingCount: sorted.filter((item) => item.blocking).length,
    removableCount: sorted.filter((item) => !item.blocking).length,
  };
}

export function relationshipTypeLabel(type: EvidenceRelationshipType) {
  switch (type) {
    case "insight": return "Insight";
    case "brief": return "Creative brief";
    case "project": return "Linked project";
    case "tag": return "Shared tag";
    case "asset": return "Private attachment";
    case "note": return "Conversation note";
    case "trend": return "Trend evidence";
    default: return "Saved connection";
  }
}
