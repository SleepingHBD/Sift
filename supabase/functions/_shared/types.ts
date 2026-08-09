export type ConnectorSource = "rss" | "manual" | "youtube";

export interface QueryBuilderInput {
  includeAll: string[];
  includeAny: string[];
  exclude: string[];
}

export interface MonitorInput {
  id: string;
  name: string;
  query: string;
  builder: QueryBuilderInput;
  language: string;
  market: string;
  sources: ConnectorSource[];
}

export interface ProjectInput {
  id: string;
  name: string;
  description?: string;
  market?: string;
}

export interface ConnectorConfigInput {
  rssFeedUrls: string[];
  manualUrls: string[];
  youtubeEnabled: boolean;
}

export interface RunRequest {
  action: "run";
  monitor: MonitorInput;
  project: ProjectInput | null;
  connectorConfig: ConnectorConfigInput;
}

export interface DeleteMonitorRequest {
  action: "delete-monitor";
  monitorId: string;
  project: ProjectInput | null;
}

export interface ExtractUrlRequest {
  action: "extract-url";
  projectId: string;
  url: string;
}

export interface NormalizedMention {
  id: string;
  platform: ConnectorSource;
  externalId: string;
  author?: string;
  content: string;
  url?: string;
  publishedAt: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagement: number;
  language?: string;
  metadata: Record<string, unknown>;
}

export interface SourceRunResult {
  source: ConnectorSource;
  status: "completed" | "failed";
  count: number;
  message?: string;
  durationMs?: number;
  attempts?: number;
  timedOut?: boolean;
  duplicatesRemoved?: number;
}

export interface RunQuotaSnapshot {
  remainingMinute: number;
  remainingDay: number;
}

export interface CollectionDiagnostics {
  mentionsFetched: number;
  duplicatesRemoved: number;
  durationMs: number;
  quota: RunQuotaSnapshot;
}
