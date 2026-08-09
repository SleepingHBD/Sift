export type StrategyAnalysisMode = "workspace_backed" | "mixed" | "general";
export type StrategyEvidenceKind = "mention" | "research" | "inspiration";

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
  limitations: string[];
}
