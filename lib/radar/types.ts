import type { EvidenceReviewStatus, Sentiment } from "@/lib/types";

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
export type RadarConversationSort = "newest" | "oldest" | "engagement" | "relevance";
export type ConnectorState = "not-connected" | "coming-later" | "available";
export type ClaimType = "fact" | "interpretation" | "hypothesis";
export type RadarScheduleFrequency = "manual" | "daily" | "weekly";
export type RadarRetentionDays = 90 | 180 | 365 | null;

export interface QueryBuilderState {
  includeAll: string[];
  includeAny: string[];
  exclude: string[];
}

export interface MonitoringQuery {
  id: string;
  cloudId?: string;
  clientRef?: string;
  cloudProjectId?: string;
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
  scheduleFrequency: RadarScheduleFrequency;
  scheduleHour: number;
  scheduleWeekday: number;
  scheduleTimezone: string;
  scheduleEnabled: boolean;
  nextScheduledRunAt?: string;
  lastScheduledRunAt?: string;
  scheduleFailureCount: number;
  lastScheduleError?: string;
  retentionDays: RadarRetentionDays;
  retentionEnabled: boolean;
  lastRetentionRunAt?: string;
  lastRetentionDeletedCount: number;
  lastRetentionError?: string;
  dataMode: "live" | "empty";
  totalMentionCount?: number;
  createdAt: string;
  lastRunAt?: string;
}

export interface RadarRetentionPreview {
  cutoffAt: string;
  candidateMentions: number;
  protectedMentions: number;
  eligibleMentions: number;
  oldestCandidateAt?: string;
}

export interface RadarSchedulerStatus {
  available: boolean;
  lastDispatchAt?: string;
  lastDispatchStatus?: string;
}

export interface RadarMention {
  id: string;
  cloudId?: string;
  cloudMonitorId?: string;
  cloudProjectId?: string;
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
  createdAt?: string;
  isImportant?: boolean;
  reviewStatus?: EvidenceReviewStatus;
  reviewedAt?: string;
}

export interface MonitorRun {
  id: string;
  cloudId?: string;
  clientRef?: string;
  monitorId: string;
  connectorIds: RadarSource[];
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  mentionsFetched: number;
  mentionsCreated: number;
  mentionsUpdated?: number;
  duplicatesRemoved?: number;
  durationMs?: number;
  persisted: boolean;
  quota?: { remainingMinute: number; remainingDay: number };
  incremental?: boolean;
  cursorAdvancedSources?: RadarSource[];
  triggerType?: "manual" | "scheduled";
  sourceResults: {
    source: RadarSource;
    status: "completed" | "failed";
    count: number;
    message?: string;
    durationMs?: number;
    attempts?: number;
    timedOut?: boolean;
    duplicatesRemoved?: number;
    collectionMode?: "snapshot" | "incremental";
    cursorAdvanced?: boolean;
  }[];
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
  exampleMentionCloudIds?: string[];
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
  topMentionCloudIds?: string[];
  likelyDrivers: { explanation: string; mentionIds: string[]; mentionCloudIds?: string[] }[];
}

export interface RadarConversationPage {
  mentions: RadarMention[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
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

export interface RadarObservedSource {
  source: RadarSource;
  label: string;
  records: number;
  engagement: number;
  firstObservedAt?: string;
  lastObservedAt?: string;
}

export interface RadarMonitorSummary {
  monitorId: string;
  scopeTopic?: string;
  rangeStart: string;
  rangeEnd: string;
  previousMentions: number;
  allTimeMentions: number;
  metrics: RadarMetrics;
  rangeFirstObservedAt?: string;
  rangeLastObservedAt?: string;
  firstObservedAt?: string;
  lastObservedAt?: string;
  sources: RadarObservedSource[];
  lastRunAt?: string;
  lastSuccessfulRunAt?: string;
  latestRunStatus?: string;
}

export interface RadarMonitorAnalysis {
  volume: VolumePoint[];
  sentiment: SentimentPoint[];
  topics: TopicIntelligence[];
  keywords: { keyword: string; count: number; growth: number }[];
  spikes: SpikeInsight[];
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
  cloudId?: string;
  mentionId: string;
  destination: EvidenceDestination;
  destinationId?: string;
  destinationCloudId?: string;
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
