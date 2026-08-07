import type { Sentiment } from "@/lib/types";

export type RadarSource =
  | "reddit"
  | "youtube"
  | "rss"
  | "news"
  | "manual"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "x";

export type DateRangeKey = "24h" | "7d" | "30d" | "90d" | "custom";
export type ConnectorState = "not-connected" | "coming-later" | "available";
export type ClaimType = "fact" | "interpretation" | "hypothesis";

export interface QueryBuilderState {
  includeAll: string[];
  includeAny: string[];
  exclude: string[];
}

export interface MonitoringQuery {
  id: string;
  name: string;
  query: string;
  description: string;
  projectId: string;
  brand?: string;
  competitors: string[];
  keywords: string[];
  excludedKeywords: string[];
  language: string;
  market: string;
  sources: RadarSource[];
  builder: QueryBuilderState;
  status: "active" | "paused" | "draft";
  dataMode: "live" | "empty";
  createdAt: string;
  lastRunAt?: string;
}

export interface RadarMention {
  id: string;
  monitorId: string;
  platform: RadarSource;
  sourceLabel: string;
  externalId: string;
  author: string;
  authorHandle?: string;
  content: string;
  url?: string;
  publishedAt: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagement: number;
  language: string;
  market?: string;
  sentiment: Sentiment;
  sentimentScore: number;
  topics: string[];
  keywords: string[];
  relevance: number;
  metadata: Record<string, unknown>;
}

export interface MonitorRun {
  id: string;
  monitorId: string;
  connectorIds: RadarSource[];
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  mentionsFetched: number;
  mentionsCreated: number;
  persisted: boolean;
  sourceResults: { source: RadarSource; status: "completed" | "failed"; count: number; message?: string }[];
  error?: string;
}

export interface DateBounds {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}

export interface VolumePoint {
  timestamp: string;
  label: string;
  mentions: number;
  baseline: number;
  spikeId?: string;
}

export interface SentimentPoint {
  timestamp: string;
  label: string;
  positive: number;
  neutral: number;
  negative: number;
}

export interface SourceBreakdown {
  source: RadarSource;
  label: string;
  mentions: number;
  share: number;
  engagement: number;
}

export interface TopicIntelligence {
  id: string;
  name: string;
  mentions: number;
  growth: number;
  sentiment: number;
  engagement: number;
  uniqueAuthors: number;
  topSource: string;
  exampleMentionIds: string[];
}

export interface SpikeInsight {
  id: string;
  timestamp: string;
  label: string;
  mentions: number;
  baseline: number;
  growth: number;
  topTopics: { name: string; mentions: number }[];
  topSources: { name: string; mentions: number }[];
  unusualKeywords: string[];
  topMentionIds: string[];
  likelyDrivers: { explanation: string; mentionIds: string[] }[];
}

export interface RadarMetrics {
  totalMentions: number;
  mentionGrowth: number;
  engagement: number;
  positive: number;
  neutral: number;
  negative: number;
  uniqueAuthors: number;
  activeSources: number;
}

export interface StrategistObservation {
  id: string;
  observation: string;
  measuredEvidence: string[];
  interpretation: string;
  hypothesis?: string;
  whyItMatters: string;
  confidence: "High" | "Medium" | "Developing";
  supportingMentionIds: string[];
}

export type EvidenceDestination = "insight" | "new-insight" | "research" | "inspiration" | "project" | "brief";

export interface RadarEvidenceLink {
  id: string;
  mentionId: string;
  destination: EvidenceDestination;
  destinationId?: string;
  destinationLabel: string;
  note?: string;
  createdAt: string;
}

export interface RadarAnalytics {
  bounds: DateBounds;
  currentMentions: RadarMention[];
  previousMentions: RadarMention[];
  metrics: RadarMetrics;
  volume: VolumePoint[];
  sentiment: SentimentPoint[];
  sources: SourceBreakdown[];
  topics: TopicIntelligence[];
  keywords: { keyword: string; count: number; growth: number }[];
  spikes: SpikeInsight[];
  observations: StrategistObservation[];
}

export interface ConnectorDescriptor {
  id: string;
  source: RadarSource;
  name: string;
  state: ConnectorState;
  description: string;
  capabilities: string[];
}
