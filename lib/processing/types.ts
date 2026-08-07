import type { NormalizedMention } from "@/lib/connectors/types";

export interface ProcessedMention extends NormalizedMention {
  sentiment: { label: "positive" | "neutral" | "negative" | "unknown"; score?: number };
  keywords: string[];
  topics: { label: string; confidence: number }[];
  entities: { name: string; type: string; confidence: number }[];
  summary?: string;
}

export interface MentionProcessor {
  process(mention: NormalizedMention): Promise<ProcessedMention>;
}

export interface ConversationClusterer {
  cluster(mentions: ProcessedMention[]): Promise<{ label: string; mentionIds: string[]; summary: string }[]>;
}

export interface SpikeDetector {
  detect(series: { timestamp: string; value: number }[], historicalBaseline: number[]): Promise<{ score: number; explanation: string }>;
}
