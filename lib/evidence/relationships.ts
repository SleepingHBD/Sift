import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import type { EvidenceKind } from "@/lib/evidence/reference";
import {
  canDeleteEvidenceFromLibrary,
  relationshipTypeLabel,
  summarizeEvidenceRelationships,
  type EvidenceIdentity,
  type EvidenceRelationshipSummary,
  type EvidenceRelationshipType,
} from "@/lib/evidence/relationship-model";

export {
  canDeleteEvidenceFromLibrary,
  relationshipTypeLabel,
  summarizeEvidenceRelationships,
  type EvidenceIdentity,
  type EvidenceRelationship,
  type EvidenceRelationshipSummary,
  type EvidenceRelationshipType,
} from "@/lib/evidence/relationship-model";

const relationshipTypes = new Set<EvidenceRelationshipType>(["signal", "strategy_stage", "notebook", "insight", "brief", "project", "saved", "tag", "asset", "note", "trend"]);

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

function requireIdentity(identity: EvidenceIdentity) {
  if (!identity.itemId || !identity.projectId) throw new Error("This evidence does not have a complete cloud identity.");
  if (!(["mention", "research", "inspiration"] as EvidenceKind[]).includes(identity.kind)) throw new Error("This evidence type cannot be inspected.");
}

function metadataRecord(value: Json): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function relationshipType(value: string): EvidenceRelationshipType {
  return relationshipTypes.has(value as EvidenceRelationshipType) ? value as EvidenceRelationshipType : "saved";
}

export async function listEvidenceRelationships(identity: EvidenceIdentity): Promise<EvidenceRelationshipSummary> {
  requireIdentity(identity);
  const client = requireClient();
  const args = {
    p_kind: identity.kind,
    p_item_id: identity.itemId,
    p_project_id: identity.projectId,
  };
  const [existing, notebook] = await Promise.all([
    client.rpc("list_evidence_relationships", args),
    client.rpc("list_evidence_notebook_relationships", args),
  ]);
  if (existing.error) throw new Error(`Evidence relationships could not be loaded: ${existing.error.message}`, { cause: existing.error });
  if (notebook.error) throw new Error(`Notebook relationships could not be loaded: ${notebook.error.message}`, { cause: notebook.error });
  return summarizeEvidenceRelationships([...(existing.data ?? []), ...(notebook.data ?? [])].map((row) => ({
    type: relationshipType(row.relationship_type),
    id: row.relationship_id,
    targetId: row.target_id ?? null,
    targetProjectId: row.target_project_id ?? null,
    label: row.label || relationshipTypeLabel(relationshipType(row.relationship_type)),
    blocking: row.blocking,
    metadata: metadataRecord(row.metadata),
  })));
}

export async function deleteEvidenceItem(identity: EvidenceIdentity) {
  requireIdentity(identity);
  if (!canDeleteEvidenceFromLibrary(identity.kind)) throw new Error("Radar mentions cannot be deleted individually from the evidence library.");
  const { data, error } = await requireClient().rpc("delete_evidence_item", {
    p_kind: identity.kind,
    p_item_id: identity.itemId,
    p_project_id: identity.projectId,
  });
  if (error) {
    const code = typeof error.code === "string" ? error.code : "";
    if (code === "23503") throw new Error("This source is still cited by an insight or brief. Remove those citations before deleting it.", { cause: error });
    if (code === "42501") throw new Error("This source is unavailable to the current account.", { cause: error });
    throw new Error(`Evidence could not be deleted: ${error.message}`, { cause: error });
  }
  if (!data) throw new Error("Evidence deletion was not confirmed by the database.");
  return data;
}
