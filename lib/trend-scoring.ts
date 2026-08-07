export interface TrendScoreInput {
  mentionGrowth: number;
  engagementGrowth: number;
  uniqueAuthorGrowth: number;
  platformCount: number;
  acceleration: number;
  baselineDeviation: number;
}

export interface TrendScoreResult {
  score: number;
  factors: Record<keyof TrendScoreInput, { normalized: number; weight: number }>;
  disclaimer: string;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function calculateDirectionalTrendScore(input: TrendScoreInput): TrendScoreResult {
  const normalized = {
    mentionGrowth: clamp(input.mentionGrowth / 2),
    engagementGrowth: clamp(input.engagementGrowth / 2),
    uniqueAuthorGrowth: clamp(input.uniqueAuthorGrowth / 1.5),
    platformCount: clamp((input.platformCount / 4) * 100),
    acceleration: clamp(input.acceleration),
    baselineDeviation: clamp(input.baselineDeviation * 20),
  };
  const weights: Record<keyof TrendScoreInput, number> = {
    mentionGrowth: 0.25,
    engagementGrowth: 0.15,
    uniqueAuthorGrowth: 0.2,
    platformCount: 0.1,
    acceleration: 0.2,
    baselineDeviation: 0.1,
  };
  const score = Math.round((Object.keys(normalized) as (keyof TrendScoreInput)[]).reduce((total, key) => total + normalized[key] * weights[key], 0));
  return {
    score,
    factors: Object.fromEntries((Object.keys(normalized) as (keyof TrendScoreInput)[]).map((key) => [key, { normalized: Math.round(normalized[key]), weight: weights[key] }])) as TrendScoreResult["factors"],
    disclaimer: "Directional heuristic for prioritization, not a scientific, causal, or population-level measure.",
  };
}
