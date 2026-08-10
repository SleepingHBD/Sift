export type StrategyAnalysisMode = "workspace_backed" | "mixed" | "general";
export type StrategyEvidenceKind = "mention" | "research" | "inspiration";
export type StrategyClaimClassification = "measured_fact" | "interpretation" | "hypothesis" | "recommendation";
export type StrategyClaimConfidence = "high" | "medium" | "low";

export interface StrategyBudgetStatus {
  configured: boolean;
  available: boolean;
  reason: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  monthlyRequestLimit: number | null;
  monthlyTokenLimit: number | null;
  completedRequests: number;
  failedRequests: number;
  activeReservations: number;
  usedRequests: number;
  usedTokens: number;
  reservedTokens: number;
  remainingRequests: number;
  remainingTokens: number;
  nextRequestReservationTokens: number;
}

export interface StrategyEvidencePreviewItem {
  identity: string;
  id: string;
  kind: StrategyEvidenceKind;
  projectId: string;
  title: string;
  author: string | null;
  sourceLabel: string;
  originalUrl: string | null;
  sourceExcerpt: string | null;
  initialInterpretation: string | null;
  strategistNotes: string | null;
  capturedAt: string;
  reviewStatus: string;
}

export interface StrategyEvidencePreview {
  mode: "workspace_backed";
  project: { id: string; name: string };
  question: string;
  searchText: string;
  evidence: StrategyEvidencePreviewItem[];
  coverage: {
    selectedCandidates: number;
    totalEvidence: number;
    excludedReviewStatuses: string[];
  };
  analysis: {
    available: boolean;
    reason: string | null;
    modelConfigured: boolean;
    budget: StrategyBudgetStatus;
  };
  limitations: string[];
}

export interface StrategyClaim {
  id: string;
  classification: StrategyClaimClassification;
  statement: string;
  whyItMatters: string;
  evidenceIds: string[];
  confidence: StrategyClaimConfidence;
  caveat: string;
}

export interface StrategyTension {
  description: string;
  implication: string;
  evidenceIds: string[];
}

export interface StrategyStructuredResponse {
  summary: string;
  claims: StrategyClaim[];
  tensions: StrategyTension[];
  evidenceGaps: string[];
  nextQuestions: string[];
  limitations: string[];
}

export interface StrategyCitation {
  claimId: string;
  classification: StrategyClaimClassification | "tension";
  evidenceIdentity: string;
  evidenceKind: StrategyEvidenceKind;
  evidenceId: string;
  title: string;
  sourceLabel: string;
  originalUrl: string | null;
}

export interface StrategyAnalysisResult {
  mode: "workspace_backed";
  origin: "openai_api" | "chatgpt_manual";
  project: { id: string; name: string };
  question: string;
  conversationId: string;
  assistantMessageId: string;
  analysis: StrategyStructuredResponse;
  citations: StrategyCitation[];
  sources: StrategyEvidencePreviewItem[];
  model: string;
  requestId: string;
  usage: Record<string, number>;
  budget?: StrategyBudgetStatus;
}
