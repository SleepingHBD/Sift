import type { EvidenceKind, EvidenceReference } from "@/lib/evidence/reference";

export type StrategyStageKind = "observation" | "pattern" | "tension" | "insight" | "opportunity";
export type StrategyClaimType = "evidence" | "interpretation" | "hypothesis" | "recommendation";
export type StrategyConfidence = "low" | "medium" | "high";
export type StrategyStageStatus = "draft" | "ready" | "approved";
export type StrategySourceRelationship = "support" | "contradict" | "context";
export type StrategyInputType = "signal" | "ai_message";
export type StrategySessionOrigin = "strategist" | "signal_assisted" | "ai_assisted" | "mixed";

export interface StrategySessionSummary {
  id: string;
  projectId: string;
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
  sources: StrategyStageSourceRecord[];
  createdAt: string;
  updatedAt: string;
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

export interface StrategySessionDetail extends StrategySessionSummary {
  stages: StrategyStageRecord[];
  inputs: StrategySessionInputRecord[];
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
