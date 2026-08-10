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
  {
    kind: "strategic_proposition",
    label: "Strategic Proposition",
    prompt: "What single direction should guide the creative work?",
    guidance: "State the focused promise, stance, or organising thought the brand can credibly own. It should answer the Opportunity without becoming a campaign line or execution.",
    claimType: "recommendation",
    position: 6,
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

export function stageProgressPercent(savedKinds: StrategyStageKind[]) {
  return Math.round((stageProgress(savedKinds) / STRATEGY_STAGE_DEFINITIONS.length) * 100);
}

export function strategicPropositionUnlocked(stages: StrategyStageRecord[]) {
  return stages.some((stage) => stage.kind === "opportunity" && Boolean(stage.content.trim()));
}

export function upstreamStageTrail(stage: StrategyStageRecord, stages: StrategyStageRecord[]) {
  const byId = new Map(stages.map((candidate) => [candidate.id, candidate]));
  const visited = new Set<string>();
  const result: StrategyStageRecord[] = [];
  function visit(current: StrategyStageRecord) {
    for (const dependency of current.dependencies) {
      const upstream = byId.get(dependency.dependsOnStageId);
      if (!upstream || visited.has(upstream.id)) continue;
      visited.add(upstream.id);
      visit(upstream);
      result.push(upstream);
    }
  }
  visit(stage);
  return result.sort((a, b) => a.position - b.position);
}

export function cleanResearchGaps(value: string) {
  return [...new Set(value.split("\n").map((item) => item.trim()).filter(Boolean))];
}

export function dependencyRelationshipLabel(relationship: StrategyDependencyRelationship) {
  if (relationship === "qualifies") return "Qualifies";
  if (relationship === "challenges") return "Challenges";
  return "Builds from";
}

export function stageApprovalChecks(stage: StrategyStageRecord, stages: StrategyStageRecord[] = []) {
  const needsSupport = stage.claimType === "evidence" || stage.kind === "observation" || stage.kind === "insight";
  const needsDependency = stage.kind !== "observation";
  const opportunity = stages.find((candidate) => candidate.kind === "opportunity");
  const directOpportunityLinked = Boolean(opportunity && stage.dependencies.some((dependency) => dependency.dependsOnStageId === opportunity.id));
  return [
    { key: "claim", label: "Claim is saved", passed: Boolean(stage.content.trim()) },
    ...(needsSupport ? [{ key: "support", label: "Supporting original evidence is linked", passed: stage.sources.some((source) => source.relationship === "support") }] : []),
    ...(stage.kind === "strategic_proposition"
      ? [{ key: "opportunity_dependency", label: "Directly connected to the Opportunity", passed: directOpportunityLinked }]
      : needsDependency ? [{ key: "dependency", label: "An earlier claim is connected", passed: stage.dependencies.length > 0 }] : []),
  ];
}
