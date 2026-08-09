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

export interface SignalAssessmentFactorRecord {
  value: number | null;
  normalized: number | null;
  weight: number;
  available: boolean;
}

export interface SignalSnapshotRecord extends SignalSnapshotSummary {
  method: string;
  supportingCount: number;
  contradictingCount: number;
  sourceDiversity: number;
  authorDiversity: number;
  growthRate: number | null;
  recencyDays: number | null;
  factors: Record<string, SignalAssessmentFactorRecord>;
  limitations: string[];
  researchGaps: string[];
}

export interface SignalEvidenceSource {
  id: string;
  projectId: string;
  kind: "mention" | "research" | "inspiration";
  title: string;
  author: string | null;
  sourceLabel: string;
  excerpt: string | null;
  excerptOrigin: "source" | "interpretation" | "notes" | null;
  originalUrl: string | null;
  publishedAt: string | null;
  capturedAt: string;
}

export interface SignalEvidenceLink {
  id: string;
  signalId: string;
  projectId: string;
  relationship: SignalEvidenceRelationship;
  rationale: string;
  weight: number;
  createdAt: string;
  source: SignalEvidenceSource;
}

export interface AddSignalEvidenceInput {
  signalId: string;
  projectId: string;
  evidenceType: SignalEvidenceSource["kind"];
  evidenceId: string;
  relationship: SignalEvidenceRelationship;
  rationale?: string;
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
  analysisChangedAt: string;
  supersededBySignalId: string | null;
  promotedTrendId: string | null;
  evidenceCounts: SignalEvidenceCounts;
  latestSnapshot: SignalSnapshotSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignalTopicOption {
  id: string;
  name: string;
}

export interface SignalRevisionRecord {
  id: string;
  changeKind: "correction" | "status" | "topic" | "merge" | "promotion";
  changedFields: string[];
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  createdAt: string;
}

export interface SignalLineageRecord {
  id: string;
  relationship: "merge" | "split";
  sourceSignalId: string;
  targetSignalId: string;
  createdAt: string;
}

export interface CreateSignalInput {
  projectId: string;
  title: string;
  observation: string;
  kind: Extract<SignalKind, "signal" | "hypothesis">;
  scopeNote: string;
  strategistNotes?: string;
}

export interface UpdateSignalInput {
  title: string;
  observation: string;
  kind: Extract<SignalKind, "signal" | "emerging_pattern" | "hypothesis">;
  scopeNote: string;
  strategistNotes: string;
  topicId: string | null;
}

export interface SplitSignalInput {
  sourceSignalId: string;
  evidenceLinkIds: string[];
  title: string;
  observation: string;
  kind: Extract<SignalKind, "signal" | "emerging_pattern" | "hypothesis">;
  scopeNote: string;
  strategistNotes: string;
  moveEvidence: boolean;
}
