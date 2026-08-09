import type { Json } from "../supabase/database.types.ts";
import type { SignalEvidenceCounts, SignalRecord, SignalSnapshotSummary } from "./types.ts";

export interface SignalRow {
  id: string;
  project_id: string;
  topic_id: string | null;
  title: string;
  observation: string;
  kind: SignalRecord["kind"];
  status: SignalRecord["status"];
  movement: SignalRecord["movement"];
  origin: SignalRecord["origin"];
  scope_note: string;
  strategist_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignalEvidenceCountRow {
  signal_id: string;
  relationship: keyof SignalEvidenceCounts;
}

export interface SignalSnapshotRow {
  id: string;
  signal_id: string;
  movement: SignalSnapshotSummary["movement"];
  evidence_sufficiency: SignalSnapshotSummary["evidenceSufficiency"];
  strength_score: number;
  analysis_version: string;
  created_at: string;
  factor_breakdown?: Json;
}

export function signalFromRow(
  row: SignalRow,
  evidenceRows: SignalEvidenceCountRow[] = [],
  latestSnapshot: SignalSnapshotRow | null = null,
): SignalRecord {
  const evidenceCounts = evidenceRows.reduce<SignalEvidenceCounts>((counts, item) => {
    counts[item.relationship] += 1;
    return counts;
  }, { support: 0, contradict: 0, context: 0 });

  return {
    id: row.id,
    projectId: row.project_id,
    topicId: row.topic_id,
    title: row.title,
    observation: row.observation,
    kind: row.kind,
    status: row.status,
    movement: row.movement,
    origin: row.origin,
    scopeNote: row.scope_note,
    strategistNotes: row.strategist_notes ?? "",
    evidenceCounts,
    latestSnapshot: latestSnapshot ? {
      id: latestSnapshot.id,
      movement: latestSnapshot.movement,
      evidenceSufficiency: latestSnapshot.evidence_sufficiency,
      strengthScore: Number(latestSnapshot.strength_score),
      analysisVersion: latestSnapshot.analysis_version,
      createdAt: latestSnapshot.created_at,
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
