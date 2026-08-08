import { calculateRadarRelevance } from "./connector-utils.ts";
import type { MonitorRun, MonitoringQuery, QueryBuilderState, RadarMention, RadarSource } from "./types.ts";

export interface RadarProjectRow {
  id: string;
  client_ref: string | null;
  name: string;
  description: string | null;
  market: string | null;
}

export interface MonitoringQueryRow {
  id: string;
  client_ref: string | null;
  project_id: string;
  brand_id: string | null;
  name: string;
  query: string;
  description: string | null;
  parsed_query: unknown;
  enabled: boolean;
  platform_filters: string[];
  language: string | null;
  market: string | null;
  keywords: string[];
  excluded_keywords: string[];
  created_at: string;
  last_run_at: string | null;
  mentions?: { count: number }[] | null;
}

export interface MentionRow {
  id: string;
  project_id: string;
  monitoring_query_id: string | null;
  platform: string;
  external_id: string | null;
  author: string | null;
  content: string;
  url: string | null;
  published_at: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagement: number;
  language: string | null;
  sentiment: "positive" | "neutral" | "negative" | "unknown";
  sentiment_score: number | null;
  keywords: string[];
  metadata: unknown;
  is_important: boolean;
  created_at: string;
  sources?: { name?: string | null } | { name?: string | null }[] | null;
  mention_topics?: { topics?: { name?: string | null } | { name?: string | null }[] | null }[] | null;
}

export interface MonitorRunRow {
  id: string;
  client_ref: string | null;
  monitoring_query_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  mentions_fetched: number;
  mentions_created: number;
  error_message: string | null;
  run_metadata: unknown;
}

const emptyBuilder: QueryBuilderState = { includeAll: [], includeAny: [], exclude: [] };

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function builderFrom(value: unknown): QueryBuilderState {
  const parsed = record(value);
  return {
    includeAll: stringArray(parsed.includeAll),
    includeAny: stringArray(parsed.includeAny),
    exclude: stringArray(parsed.exclude),
  };
}

export function sourceFromDatabase(value: string): RadarSource {
  if (value === "manual_url" || value === "manual_note") return "manual";
  if (value === "blog") return "rss";
  if (["reddit", "youtube", "rss", "news", "tiktok", "instagram", "facebook", "linkedin", "x"].includes(value)) return value as RadarSource;
  return "manual";
}

export function sourceToDatabase(value: RadarSource) {
  if (value === "manual") return "manual_url" as const;
  if (["reddit", "youtube", "rss", "news"].includes(value)) return value as "reddit" | "youtube" | "rss" | "news";
  return "future_connector" as const;
}

export function monitoringQueryFromRow(
  row: MonitoringQueryRow,
  projectClientRef: string,
  brand = "",
  competitors: string[] = [],
  mentionCount = 0,
): MonitoringQuery {
  const clientRef = row.client_ref ?? row.id;
  const builder = builderFrom(row.parsed_query);
  return {
    id: clientRef,
    cloudId: row.id,
    clientRef,
    cloudProjectId: row.project_id,
    name: row.name,
    query: row.query,
    description: row.description ?? "",
    projectId: projectClientRef === "personal-radar" ? "" : projectClientRef,
    brand: brand || undefined,
    competitors,
    keywords: row.keywords ?? builder.includeAny,
    excludedKeywords: row.excluded_keywords ?? builder.exclude,
    language: row.language || "Any language",
    market: row.market ?? "",
    sources: (row.platform_filters ?? []).map(sourceFromDatabase),
    builder: builder.includeAll.length || builder.includeAny.length || builder.exclude.length ? builder : emptyBuilder,
    status: row.enabled ? "active" : "paused",
    dataMode: mentionCount > 0 ? "live" : "empty",
    createdAt: row.created_at,
    lastRunAt: row.last_run_at ?? undefined,
  };
}

function relatedName(value: MentionRow["sources"]) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.name || "Collected source";
}

function topicNames(value: MentionRow["mention_topics"]) {
  return (value ?? []).flatMap((link) => {
    const topics = Array.isArray(link.topics) ? link.topics : link.topics ? [link.topics] : [];
    return topics.flatMap((topic) => topic.name ? [topic.name] : []);
  });
}

export function radarMentionFromRow(row: MentionRow, monitor: MonitoringQuery): RadarMention {
  const platform = sourceFromDatabase(row.platform);
  const externalId = row.external_id ?? row.id;
  const metadata = record(row.metadata);
  return {
    id: `${monitor.id}:${platform}:${externalId}`,
    cloudId: row.id,
    cloudMonitorId: row.monitoring_query_id ?? undefined,
    cloudProjectId: row.project_id,
    monitorId: monitor.id,
    platform,
    sourceLabel: relatedName(row.sources),
    externalId,
    author: row.author || "Unknown author",
    authorHandle: typeof metadata.authorHandle === "string" ? metadata.authorHandle : undefined,
    content: row.content,
    url: row.url ?? undefined,
    publishedAt: row.published_at ?? row.created_at,
    likes: Number(row.likes),
    comments: Number(row.comments),
    shares: Number(row.shares),
    views: Number(row.views),
    engagement: Number(row.engagement),
    language: row.language || "unknown",
    market: monitor.market || undefined,
    sentiment: row.sentiment === "unknown" ? "neutral" : row.sentiment,
    sentimentScore: Number(row.sentiment_score ?? 0),
    topics: topicNames(row.mention_topics),
    keywords: row.keywords ?? [],
    relevance: calculateRadarRelevance(row.content, monitor),
    metadata,
    createdAt: row.created_at,
    isImportant: row.is_important,
  };
}

function sourceResultsFrom(value: unknown): MonitorRun["sourceResults"] {
  const metadata = record(value);
  const results = Array.isArray(metadata.sourceResults) ? metadata.sourceResults : [];
  return results.flatMap((item) => {
    const result = record(item);
    if (typeof result.source !== "string" || (result.status !== "completed" && result.status !== "failed")) return [];
    return [{
      source: sourceFromDatabase(result.source),
      status: result.status,
      count: typeof result.count === "number" ? result.count : 0,
      message: typeof result.message === "string" ? result.message : undefined,
    }];
  });
}

export function monitorRunFromRow(row: MonitorRunRow, monitorClientRef: string): MonitorRun {
  const sourceResults = sourceResultsFrom(row.run_metadata);
  return {
    id: row.client_ref ?? row.id,
    cloudId: row.id,
    clientRef: row.client_ref ?? undefined,
    monitorId: monitorClientRef,
    connectorIds: [...new Set(sourceResults.map((result) => result.source))],
    status: row.status === "running" || row.status === "failed" ? row.status : "completed",
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    mentionsFetched: row.mentions_fetched,
    mentionsCreated: row.mentions_created,
    persisted: true,
    sourceResults,
    error: row.error_message ?? undefined,
  };
}

export function shouldPersistMonitorRun(run: Pick<MonitorRun, "cloudId" | "persisted">) {
  return !run.persisted && !run.cloudId;
}

export function createMonitorClientRef(randomUuid = () => crypto.randomUUID()) {
  return `monitor-${randomUuid()}`;
}
