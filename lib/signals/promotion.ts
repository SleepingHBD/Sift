import type { SignalRecord, SignalSnapshotRecord } from "./types.ts";

export interface SignalPromotionRequirement {
  id: "watching" | "claim" | "assessment" | "current" | "support" | "sources" | "authors" | "contradiction";
  label: string;
  met: boolean;
  detail: string;
}

export interface SignalPromotionGate {
  eligible: boolean;
  requirements: SignalPromotionRequirement[];
}

export function signalPromotionGate(
  signal: SignalRecord,
  latestSnapshot: SignalSnapshotRecord | null | undefined,
): SignalPromotionGate {
  const snapshotIsCurrent = Boolean(
    latestSnapshot
    && Date.parse(latestSnapshot.createdAt) >= Date.parse(signal.analysisChangedAt),
  );
  const contradictionLimit = latestSnapshot
    ? Math.floor(latestSnapshot.supportingCount / 2)
    : 0;

  const requirements: SignalPromotionRequirement[] = [
    {
      id: "watching",
      label: "Actively watched",
      met: signal.status === "watching",
      detail: "Move the signal to Watching before promotion.",
    },
    {
      id: "claim",
      label: "Observed claim",
      met: signal.kind !== "hypothesis" && signal.status !== "promoted" && !signal.supersededBySignalId,
      detail: "A hypothesis or superseded signal cannot be named as an observed trend.",
    },
    {
      id: "assessment",
      label: "Sufficient assessment",
      met: latestSnapshot?.evidenceSufficiency === "sufficient",
      detail: "Create an assessment that reaches sufficient evidence.",
    },
    {
      id: "current",
      label: "Assessment is current",
      met: snapshotIsCurrent,
      detail: "Reassess after the latest claim, topic, note, or evidence change.",
    },
    {
      id: "support",
      label: "Six supporting sources",
      met: (latestSnapshot?.supportingCount ?? 0) >= 6,
      detail: "Connect at least six sources that directly support the claim.",
    },
    {
      id: "sources",
      label: "Three source origins",
      met: (latestSnapshot?.sourceDiversity ?? 0) >= 3,
      detail: "Broaden the evidence beyond one or two source environments.",
    },
    {
      id: "authors",
      label: "Four distinct authors",
      met: (latestSnapshot?.authorDiversity ?? 0) >= 4,
      detail: "Reduce the risk that one voice is being mistaken for a pattern.",
    },
    {
      id: "contradiction",
      label: "Contradiction is not dominant",
      met: Boolean(
        latestSnapshot
        && latestSnapshot.movement !== "contradictory"
        && latestSnapshot.contradictingCount <= contradictionLimit,
      ),
      detail: "Contradicting sources must not exceed half of supporting sources.",
    },
  ];

  return {
    eligible: requirements.every((requirement) => requirement.met),
    requirements,
  };
}
