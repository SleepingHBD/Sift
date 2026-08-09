export type SignalKind = "signal" | "emerging_pattern" | "observed_trend" | "hypothesis";
export type SignalStatus = "candidate" | "watching" | "promoted" | "dismissed";
export type SignalMovement = "new" | "strengthening" | "stable" | "weakening" | "contradictory" | "uncertain";
export type SignalOrigin = "strategist" | "deterministic" | "ai_assisted";
export type SignalEvidenceRelationship = "support" | "contradict" | "context";
export type SignalEvidenceSufficiency = "insufficient" | "limited" | "developing" | "sufficient";

export interface SignalEvidenceCounts {
  support: number;
  contradict: number;
  context: number;
}

export interface SignalSnapshotSummary {
  id: string;
  movement: SignalMovement;
  evidenceSufficiency: SignalEvidenceSufficiency;
  strengthScore: number;
  analysisVersion: string;
  createdAt: string;
}

export interface SignalRecord {
  id: string;
  projectId: string;
  topicId: string | null;
  title: string;
  observation: string;
  kind: SignalKind;
  status: SignalStatus;
  movement: SignalMovement;
  origin: SignalOrigin;
  scopeNote: string;
  strategistNotes: string;
  evidenceCounts: SignalEvidenceCounts;
  latestSnapshot: SignalSnapshotSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSignalInput {
  projectId: string;
  title: string;
  observation: string;
  kind: Extract<SignalKind, "signal" | "hypothesis">;
  scopeNote: string;
  strategistNotes?: string;
}
