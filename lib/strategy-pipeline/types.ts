import type { EvidenceKind, EvidenceReference } from "@/lib/evidence/reference";

export type StrategyStageKind = "observation" | "pattern" | "tension" | "insight" | "opportunity" | "strategic_proposition";
export type StrategyClaimType = "evidence" | "interpretation" | "hypothesis" | "recommendation";
export type StrategyConfidence = "low" | "medium" | "high";
export type StrategyStageStatus = "draft" | "ready" | "approved";
export type StrategySourceRelationship = "support" | "contradict" | "context";
export type StrategyDependencyRelationship = "derives_from" | "qualifies" | "challenges";
export type StrategyAlternativeStatus = "considering" | "retained" | "rejected";
export type StrategyInputType = "signal" | "ai_message";
export type StrategySessionOrigin = "strategist" | "signal_assisted" | "ai_assisted" | "mixed";
export type StrategyTurnRole = "user" | "assistant";
export type StrategyTurnOrigin = "strategist" | "chatgpt_manual" | "sift_guidance";
export type StrategyPieceKind = "observation" | "question" | "interpretation" | "tension" | "hypothesis" | "opportunity";
export type StrategyPieceStatus = "active" | "dismissed" | "shaped";
export type StrategyConnectionRelationship = "related" | "reinforces" | "contradicts" | "opens_question";
export type StrategyConnectionOrigin = "strategist" | "deterministic";
export type StrategyConnectionStatus = "accepted" | "dismissed";

export interface StrategySessionSummary {
  id: string;
  projectId: string;
  createdBy: string;
  title: string;
  status: "active" | "complete" | "archived";
  origin: StrategySessionOrigin;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyEvidenceSource {
  id: string;
  projectId: string;
  kind: EvidenceKind;
  title: string;
  author: string | null;
  sourceLabel: string;
  excerpt: string | null;
  originalUrl: string | null;
  capturedAt: string;
}

export interface StrategyStageSourceRecord {
  id: string;
  stageId: string;
  projectId: string;
  relationship: StrategySourceRelationship;
  excerpt: string | null;
  rationale: string | null;
  createdAt: string;
  source: StrategyEvidenceSource;
}

export interface StrategyStageRecord {
  id: string;
  sessionId: string;
  projectId: string;
  kind: StrategyStageKind;
  content: string;
  claimType: StrategyClaimType;
  position: number;
  status: StrategyStageStatus;
  confidence: StrategyConfidence;
  researchGaps: string[];
  approvalNote: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  sources: StrategyStageSourceRecord[];
  alternatives: StrategyStageAlternativeRecord[];
  dependencies: StrategyStageDependencyRecord[];
  revisions: StrategyStageRevisionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface StrategyStageAlternativeRecord {
  id: string;
  projectId: string;
  stageId: string;
  content: string;
  claimType: StrategyClaimType;
  confidence: StrategyConfidence;
  status: StrategyAlternativeStatus;
  rationale: string | null;
  researchGaps: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StrategyStageDependencyRecord {
  id: string;
  projectId: string;
  stageId: string;
  dependsOnStageId: string;
  relationship: StrategyDependencyRelationship;
  rationale: string | null;
  createdAt: string;
}

export interface StrategyStageRevisionRecord {
  id: string;
  projectId: string;
  stageId: string;
  alternativeId: string | null;
  entityType: "stage" | "alternative";
  changeKind: "correction" | "status" | "approval" | "order" | "research_gaps";
  changedFields: string[];
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  changedBy: string | null;
  createdAt: string;
}

export interface StrategySessionInputRecord {
  id: string;
  projectId: string;
  sessionId: string;
  inputType: StrategyInputType;
  inputId: string;
  role: "starting_point" | "context";
  rationale: string | null;
  title: string;
  excerpt: string;
  createdAt: string;
}

export interface StrategySessionTurnRecord {
  id: string;
  projectId: string;
  sessionId: string;
  role: StrategyTurnRole;
  origin: StrategyTurnOrigin;
  content: string;
  metadata: Record<string, unknown>;
  aiMessageId: string | null;
  createdBy: string;
  createdAt: string;
  sources: StrategyTurnSourceRecord[];
}

export interface StrategyTurnSourceRecord {
  id: string;
  turnId: string;
  projectId: string;
  relationship: "context";
  excerpt: string | null;
  rationale: string | null;
  createdAt: string;
  source: StrategyEvidenceSource;
}

export interface StrategyPieceSourceRecord {
  id: string;
  pieceId: string;
  projectId: string;
  relationship: StrategySourceRelationship;
  excerpt: string | null;
  rationale: string | null;
  createdAt: string;
  source: StrategyEvidenceSource;
}

export interface StrategySessionPieceRecord {
  id: string;
  projectId: string;
  sessionId: string;
  sourceTurnId: string;
  kind: StrategyPieceKind;
  origin: "strategist" | "chatgpt_manual";
  externalRef: string;
  content: string;
  whyItMatters: string | null;
  confidence: StrategyConfidence | null;
  caveat: string | null;
  status: StrategyPieceStatus;
  sources: StrategyPieceSourceRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface StrategySessionConnectionRecord {
  id: string;
  projectId: string;
  sessionId: string;
  sourceTurnId: string;
  targetTurnId: string;
  relationship: StrategyConnectionRelationship;
  origin: StrategyConnectionOrigin;
  status: StrategyConnectionStatus;
  rationale: string | null;
  factors: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyConnectionSuggestion {
  key: string;
  sourceTurnId: string;
  targetTurnId: string;
  relationship: StrategyConnectionRelationship;
  rationale: string;
  factors: string[];
  score: number;
}

export interface StrategyEmergingThread {
  id: string;
  label: string;
  turnIds: string[];
  connectionIds: string[];
  latestAt: string;
}

export interface SaveStrategyConnectionInput {
  sessionId: string;
  projectId: string;
  sourceTurnId: string;
  targetTurnId: string;
  relationship: StrategyConnectionRelationship;
  origin: StrategyConnectionOrigin;
  status: StrategyConnectionStatus;
  rationale?: string;
  factors?: string[];
}

export interface StrategySessionDetail extends StrategySessionSummary {
  stages: StrategyStageRecord[];
  inputs: StrategySessionInputRecord[];
  turns: StrategySessionTurnRecord[];
  pieces: StrategySessionPieceRecord[];
  connections: StrategySessionConnectionRecord[];
}

export interface StrategyAiInputOption {
  id: string;
  conversationId: string;
  title: string;
  excerpt: string;
  createdAt: string;
}

export interface SaveStrategyStageInput {
  id?: string;
  sessionId: string;
  projectId: string;
  kind: StrategyStageKind;
  content: string;
  claimType: StrategyClaimType;
  position: number;
  confidence: StrategyConfidence;
  researchGaps: string[];
}

export interface AttachStrategyEvidenceInput {
  projectId: string;
  stageId: string;
  evidence: EvidenceReference;
  relationship: StrategySourceRelationship;
  rationale?: string;
}

export interface CreateStrategyAlternativeInput {
  projectId: string;
  stageId: string;
  content: string;
  claimType: StrategyClaimType;
  confidence: StrategyConfidence;
  rationale?: string;
  researchGaps: string[];
}

export interface UpdateStrategyAlternativeInput extends CreateStrategyAlternativeInput {
  id: string;
  status: StrategyAlternativeStatus;
}

export interface CreateStrategyDependencyInput {
  projectId: string;
  stageId: string;
  dependsOnStageId: string;
  relationship: StrategyDependencyRelationship;
  rationale?: string;
}
