import type {
  StrategyClaimType,
  StrategyDependencyRelationship,
  StrategySessionOrigin,
  StrategySourceRelationship,
  StrategyStageKind,
  StrategyStageRecord,
} from "./types";

export interface StrategyStageDefinition {
  kind: StrategyStageKind;
  label: string;
  prompt: string;
  guidance: string;
  claimType: StrategyClaimType;
  position: number;
}

export const STRATEGY_STAGE_DEFINITIONS: StrategyStageDefinition[] = [
  {
    kind: "observation",
    label: "Observation",
    prompt: "What did you actually observe?",
    guidance: "Record the concrete behaviour, language, or change visible in the evidence. Avoid explaining it yet.",
    claimType: "evidence",
    position: 1,
  },
  {
    kind: "pattern",
    label: "Pattern",
    prompt: "What repeats across the evidence?",
    guidance: "Connect recurring behaviours, themes, or contrasts. State what appears consistent and where it does not.",
    claimType: "interpretation",
    position: 2,
  },
  {
    kind: "tension",
    label: "Tension",
    prompt: "What competing needs or beliefs are colliding?",
    guidance: "Describe the friction people experience, without turning it into a slogan or solution.",
    claimType: "interpretation",
    position: 3,
  },
  {
    kind: "insight",
    label: "Insight",
    prompt: "What human truth explains the behaviour?",
    guidance: "Make a specific interpretation that connects the pattern and tension. Keep it open to challenge.",
    claimType: "interpretation",
    position: 4,
  },
  {
    kind: "opportunity",
    label: "Opportunity",
    prompt: "What credible opening does this create?",
    guidance: "Translate the insight into a strategic direction for the brand, not a finished execution.",
    claimType: "recommendation",
    position: 5,
  },
];

export function stageDefinition(kind: StrategyStageKind) {
  const definition = STRATEGY_STAGE_DEFINITIONS.find((item) => item.kind === kind);
  if (!definition) throw new Error(`Unknown strategy stage: ${kind}`);
  return definition;
}

export function nextSessionOrigin(current: StrategySessionOrigin, inputType: "signal" | "ai_message"): StrategySessionOrigin {
  const incoming = inputType === "signal" ? "signal_assisted" : "ai_assisted";
  if (current === "strategist") return incoming;
  if (current === incoming || current === "mixed") return current;
  return "mixed";
}

export function relationshipLabel(relationship: StrategySourceRelationship) {
  if (relationship === "contradict") return "Challenges";
  if (relationship === "context") return "Context";
  return "Supports";
}

export function stageProgress(savedKinds: StrategyStageKind[]) {
  const saved = new Set(savedKinds);
  return STRATEGY_STAGE_DEFINITIONS.filter((stage) => saved.has(stage.kind)).length;
}

export function cleanResearchGaps(value: string) {
  return [...new Set(value.split("\n").map((item) => item.trim()).filter(Boolean))];
}

export function dependencyRelationshipLabel(relationship: StrategyDependencyRelationship) {
  if (relationship === "qualifies") return "Qualifies";
  if (relationship === "challenges") return "Challenges";
  return "Builds from";
}

export function stageApprovalChecks(stage: StrategyStageRecord) {
  const needsSupport = stage.claimType === "evidence" || stage.kind === "observation" || stage.kind === "insight";
  const needsDependency = stage.kind !== "observation";
  return [
    { key: "claim", label: "Claim is saved", passed: Boolean(stage.content.trim()) },
    ...(needsSupport ? [{ key: "support", label: "Supporting original evidence is linked", passed: stage.sources.some((source) => source.relationship === "support") }] : []),
    ...(needsDependency ? [{ key: "dependency", label: "An earlier claim is connected", passed: stage.dependencies.length > 0 }] : []),
  ];
}
