import type { StrategyHandoffTask } from "./handoff";
import type { StrategyAnalysisResult, StrategyEvidencePreview } from "./types";

export type StrategyWorkingStatus = "idle" | "loading" | "error";
export type StrategyHandoffStatus = "idle" | "saving" | "saved" | "error";

export interface StrategyWorkingSession {
  workspaceUserId: string;
  projectId: string;
  question: string;
  task: StrategyHandoffTask;
  preview: StrategyEvidencePreview | null;
  selected: Set<string>;
  analysis: StrategyAnalysisResult | null;
  status: StrategyWorkingStatus;
  error: string;
  handoffPrompt: string;
  handoffResponse: string;
  handoffRequestId: string;
  handoffStatus: StrategyHandoffStatus;
  handoffError: string;
  copied: boolean;
}

export function createStrategyWorkingSession(workspaceUserId = "", projectId = ""): StrategyWorkingSession {
  return {
    workspaceUserId,
    projectId,
    question: "",
    task: "analyse",
    preview: null,
    selected: new Set(),
    analysis: null,
    status: "idle",
    error: "",
    handoffPrompt: "",
    handoffResponse: "",
    handoffRequestId: "",
    handoffStatus: "idle",
    handoffError: "",
    copied: false,
  };
}
