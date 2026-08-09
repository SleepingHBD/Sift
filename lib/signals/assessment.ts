import type { SignalEvidenceLink, SignalEvidenceSufficiency, SignalMovement, SignalSnapshotRecord } from "./types.ts";

export const SIGNAL_ANALYSIS_VERSION = "signal-heuristic-v1";
export const SIGNAL_ASSESSMENT_DISCLAIMER =
  "Directional prioritisation heuristic based only on evidence collected in this project. It is not a causal or population-level measure.";

export interface SignalAssessmentInput {
  supportingEvidence: number;
  contradictingEvidence: number;
  sourceDiversity: number;
  authorDiversity: number;
  recentGrowthPercent?: number | null;
  daysSinceNewestEvidence?: number | null;
  previousStrengthScore?: number | null;
}

export interface SignalFactor {
  value: number | null;
  normalized: number | null;
  weight: number;
  available: boolean;
}

export interface SignalAssessment {
  analysisVersion: typeof SIGNAL_ANALYSIS_VERSION;
  strengthScore: number;
  movement: SignalMovement;
  evidenceSufficiency: SignalEvidenceSufficiency;
  factors: Record<"evidenceVolume" | "sourceDiversity" | "authorDiversity" | "recentGrowth" | "recency", SignalFactor>;
  limitations: string[];
  researchGaps: string[];
  disclaimer: string;
}

export interface SignalAssessmentDraft {
  input: SignalAssessmentInput;
  assessment: SignalAssessment;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

function factor(value: number | null, normalized: number | null, weight: number): SignalFactor {
  return { value, normalized, weight, available: value !== null && normalized !== null };
}

export function assessSignal(input: SignalAssessmentInput): SignalAssessment {
  const support = Math.max(0, Math.floor(input.supportingEvidence));
  const contradict = Math.max(0, Math.floor(input.contradictingEvidence));
  const sources = Math.max(0, Math.floor(input.sourceDiversity));
  const authors = Math.max(0, Math.floor(input.authorDiversity));
  const growth = input.recentGrowthPercent == null ? null : Number(input.recentGrowthPercent);
  const age = input.daysSinceNewestEvidence == null ? null : Math.max(0, Number(input.daysSinceNewestEvidence));

  const factors = {
    evidenceVolume: factor(support, clamp((support / 8) * 100), 0.32),
    sourceDiversity: factor(sources, clamp((sources / 3) * 100), 0.23),
    authorDiversity: factor(authors, clamp((authors / 8) * 100), 0.18),
    recentGrowth: factor(growth, growth === null ? null : clamp(50 + growth / 2), 0.17),
    recency: factor(age, age === null ? null : clamp(100 - age * 4), 0.1),
  } satisfies SignalAssessment["factors"];

  const available = Object.values(factors).filter((item) => item.available);
  const availableWeight = available.reduce((total, item) => total + item.weight, 0);
  const weighted = available.reduce((total, item) => total + (item.normalized ?? 0) * item.weight, 0);
  const contradictionPenalty = support + contradict === 0 ? 0 : (contradict / (support + contradict)) * 25;
  const strengthScore = Math.round(clamp(availableWeight ? weighted / availableWeight - contradictionPenalty : 0));

  let evidenceSufficiency: SignalEvidenceSufficiency = "sufficient";
  if (support === 0) evidenceSufficiency = "insufficient";
  else if (support < 3 || sources < 2) evidenceSufficiency = "limited";
  else if (support < 6 || authors < 4) evidenceSufficiency = "developing";

  let movement: SignalMovement = "uncertain";
  const previous = input.previousStrengthScore;
  if (contradict > support && contradict >= 2) movement = "contradictory";
  else if (previous == null) movement = support ? "new" : "uncertain";
  else if (strengthScore >= previous + 8) movement = "strengthening";
  else if (strengthScore <= previous - 8) movement = "weakening";
  else movement = "stable";

  const limitations: string[] = [];
  const researchGaps: string[] = [];
  if (support < 3) limitations.push("Too few supporting sources for a dependable pattern.");
  if (sources < 2) limitations.push("Evidence comes from fewer than two source types.");
  if (authors < 3) limitations.push("The observed conversation may be concentrated among very few voices.");
  if (growth === null) limitations.push("No comparable growth window is available yet.");
  if (age === null) limitations.push("Evidence recency has not been established.");
  if (contradict === 0) researchGaps.push("Actively look for evidence that would challenge this signal.");
  if (sources < 3) researchGaps.push("Collect evidence from another relevant source or research method.");
  if (growth === null) researchGaps.push("Establish a second time window before describing acceleration.");

  return {
    analysisVersion: SIGNAL_ANALYSIS_VERSION,
    strengthScore,
    movement,
    evidenceSufficiency,
    factors,
    limitations,
    researchGaps,
    disclaimer: SIGNAL_ASSESSMENT_DISCLAIMER,
  };
}

function uniqueCount(values: Array<string | null | undefined>) {
  return new Set(values.flatMap((value) => value?.trim() ? [value.trim().toLocaleLowerCase()] : [])).size;
}

export function buildSignalAssessmentDraft(
  links: SignalEvidenceLink[],
  snapshots: Pick<SignalSnapshotRecord, "strengthScore">[] = [],
  now = new Date(),
): SignalAssessmentDraft {
  const evidenceDates = links.flatMap((link) => {
    const value = link.source.publishedAt ?? link.source.capturedAt;
    const time = Date.parse(value);
    return Number.isFinite(time) ? [time] : [];
  });
  const newestEvidence = evidenceDates.length ? Math.max(...evidenceDates) : null;
  const daysSinceNewestEvidence = newestEvidence === null
    ? null
    : Math.max(0, Math.floor((now.getTime() - newestEvidence) / 86_400_000));
  const input: SignalAssessmentInput = {
    supportingEvidence: links.filter((link) => link.relationship === "support").length,
    contradictingEvidence: links.filter((link) => link.relationship === "contradict").length,
    sourceDiversity: uniqueCount(links.map((link) => link.source.sourceLabel)),
    authorDiversity: uniqueCount(links.map((link) => link.source.author)),
    recentGrowthPercent: null,
    daysSinceNewestEvidence,
    previousStrengthScore: snapshots[0]?.strengthScore ?? null,
  };
  return { input, assessment: assessSignal(input) };
}
