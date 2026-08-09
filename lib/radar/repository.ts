import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  monitorRunFromRow,
  monitoringQueryFromRow,
  radarMentionFromRow,
  shouldPersistMonitorRun,
  sourceToDatabase,
  type MentionRow,
  type MonitoringQueryRow,
  type MonitorRunRow,
  type RadarProjectRow,
} from "@/lib/radar/model";
import { radarMonitorAnalysisFromRow, type RadarMonitorAnalysisRow } from "@/lib/radar/analysis";
import { radarBucketMilliseconds } from "@/lib/radar/processing";
import { radarMonitorSummaryFromRow, type RadarMonitorSummaryRow } from "@/lib/radar/summary";
import { decodeRadarConversationCursor, encodeRadarConversationCursor, radarMentionFromConversation, type RadarConversationRpcRow } from "@/lib/radar/conversations";
import type { RadarConnectorSettings } from "@/lib/radar/connector-utils";
import type { DateBounds, DateRangeKey, MonitorRun, MonitoringQuery, RadarConversationPage, RadarConversationSort, RadarMention, RadarMonitorAnalysis, RadarMonitorSummary, RadarRetentionDays, RadarRetentionPreview, RadarSchedulerStatus, RadarSource } from "@/lib/radar/types";
import type { Project } from "@/lib/types";
import type { Json } from "@/lib/supabase/database.types";

type SiftSupabaseClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

const internalRadarProjectRef = "personal-radar";
const monitorSelect = "id,client_ref,project_id,brand_id,name,query,description,parsed_query,enabled,schedule_frequency,schedule_hour,schedule_weekday,schedule_timezone,schedule_enabled,next_scheduled_run_at,last_scheduled_run_at,schedule_failure_count,last_schedule_error,retention_days,retention_enabled,last_retention_run_at,last_retention_deleted_count,last_retention_error,platform_filters,language,market,keywords,excluded_keywords,created_at,last_run_at,mentions(count)";
const mentionSelect = "id,project_id,monitoring_query_id,platform,external_id,author,content,url,published_at,likes,comments,shares,views,engagement,language,sentiment,sentiment_score,keywords,metadata,is_important,review_status,reviewed_at,created_at,sources(name),mention_topics(topics(name))";
const runSelect = "id,client_ref,monitoring_query_id,status,started_at,completed_at,mentions_fetched,mentions_created,mentions_updated,error_message,run_metadata";
const pageSize = 500;
const maximumMentionRows = 5000;
const conversationPageSize = 24;

export interface RadarConversationPageRequest {
  monitor: MonitoringQuery;
  bounds: Pick<DateBounds, "start" | "end">;
  search?: string;
  source?: string;
  sentiment?: string;
  topic?: string;
  keyword?: string;
  minimumEngagement?: number;
  sort?: RadarConversationSort;
  cursor?: string | null;
  pageSize?: number;
}

export interface RadarCloudSnapshot {
  monitors: MonitoringQuery[];
  mentionsByMonitor: Record<string, RadarMention[]>;
  runs: MonitorRun[];
  truncated: boolean;
}

export interface LocalRadarPayload {
  monitors: MonitoringQuery[];
  mentionsByMonitor: Record<string, RadarMention[]>;
  runs: MonitorRun[];
}

interface RadarRetentionPreviewRow {
  cutoff_at: string;
  candidate_mentions: number | string;
  protected_mentions: number | string;
  eligible_mentions: number | string;
  oldest_candidate_at: string | null;
}

interface RadarSchedulerStatusRow {
  available: boolean;
  last_dispatch_at: string | null;
  last_dispatch_status: string | null;
}

interface ConnectorConfigRow {
  source_kind: string;
  enabled: boolean;
  config: unknown;
}

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

export async function getCloudRadarConversationPage(request: RadarConversationPageRequest): Promise<RadarConversationPage> {
  if (!request.monitor.cloudId) throw new Error("This monitor has not been verified in Supabase yet.");
  const client = requireClient();
  const pageSize = Math.min(Math.max(Math.trunc(request.pageSize ?? conversationPageSize), 1), 100);
  const sort = request.sort ?? "newest";
  const cursor = request.cursor ? decodeRadarConversationCursor(request.cursor) : null;
  if (cursor && cursor.sort !== sort) throw new Error("The conversation page cursor no longer matches this sort.");
  const { data, error } = await client.rpc("radar_conversation_page", {
    p_monitor_id: request.monitor.cloudId,
    p_start: request.bounds.start.toISOString(),
    p_end: request.bounds.end.toISOString(),
    p_search: request.search?.trim() || undefined,
    p_source: request.source && request.source !== "all" ? request.source : undefined,
    p_sentiment: request.sentiment && request.sentiment !== "all" ? request.sentiment : undefined,
    p_topic: request.topic?.trim() || undefined,
    p_keyword: request.keyword?.trim() || undefined,
    p_min_engagement: Math.max(0, request.minimumEngagement ?? 0),
    p_sort: sort,
    p_cursor: cursor ? cursor as Json : undefined,
    p_page_size: pageSize,
  });
  if (error) throw new Error(`Complete conversation history could not be loaded: ${error.message}`);
  const rows = (data ?? []) as unknown as RadarConversationRpcRow[];
  const hasMore = rows.length > pageSize;
  const visible = rows.slice(0, pageSize);
  return {
    mentions: visible.map((row) => radarMentionFromConversation(row.conversation, request.monitor)),
    total: numberValue(visible[0]?.total_count),
    hasMore,
    nextCursor: hasMore && visible.length ? encodeRadarConversationCursor(visible[visible.length - 1].cursor_value) : null,
  };
}

export async function getCloudRadarMentionsByIds(monitor: MonitoringQuery, mentionIds: string[]) {
  if (!monitor.cloudId) throw new Error("This monitor has not been verified in Supabase yet.");
  const uniqueIds = [...new Set(mentionIds.filter(Boolean))].slice(0, 50);
  if (!uniqueIds.length) return [];
  const client = requireClient();
  const { data, error } = await client.rpc("radar_mentions_by_ids", {
    p_monitor_id: monitor.cloudId,
    p_mention_ids: uniqueIds,
  });
  if (error) throw new Error(`Supporting conversations could not be loaded: ${error.message}`);
  return ((data ?? []) as unknown as RadarConversationRpcRow[]).map((row) => radarMentionFromConversation(row.conversation, monitor));
}

export async function getCloudRadarRetentionPreview(
  monitorId: string,
  retentionDays: Exclude<RadarRetentionDays, null>,
): Promise<RadarRetentionPreview> {
  const client = requireClient();
  const { data, error } = await client.rpc("radar_retention_preview", {
    p_monitor_id: monitorId,
    p_retention_days: retentionDays,
  });
  if (error) throw new Error(`Retention preview could not be calculated: ${error.message}`);
  const row = (data ?? [])[0] as unknown as RadarRetentionPreviewRow | undefined;
  if (!row) throw new Error("Retention preview did not return a result.");
  return {
    cutoffAt: row.cutoff_at,
    candidateMentions: numberValue(row.candidate_mentions),
    protectedMentions: numberValue(row.protected_mentions),
    eligibleMentions: numberValue(row.eligible_mentions),
    oldestCandidateAt: row.oldest_candidate_at ?? undefined,
  };
}

export async function getCloudRadarSchedulerStatus(): Promise<RadarSchedulerStatus> {
  const client = requireClient();
  const { data, error } = await client.rpc("radar_scheduler_status");
  if (error) throw new Error(`Radar scheduler status could not be verified: ${error.message}`);
  const row = (data ?? [])[0] as unknown as RadarSchedulerStatusRow | undefined;
  return {
    available: row?.available === true,
    lastDispatchAt: row?.last_dispatch_at ?? undefined,
    lastDispatchStatus: row?.last_dispatch_status ?? undefined,
  };
}

export async function getCloudRadarConnectorSettings(): Promise<RadarConnectorSettings | null> {
  const client = requireClient();
  const { data, error } = await client.from("connector_configs")
    .select("source_kind,enabled,config")
    .in("source_kind", ["rss", "manual_url", "youtube"]);
  if (error) throw new Error(`Radar source settings could not be loaded: ${error.message}`);
  const rows = (data ?? []) as unknown as ConnectorConfigRow[];
  if (!rows.length) return null;
  const rssFeedUrls = new Set<string>();
  const manualUrls = new Set<string>();
  let youtubeEnabled = false;
  for (const row of rows) {
    const config = row.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? row.config as Record<string, unknown>
      : {};
    const urls = Array.isArray(config.urls)
      ? config.urls.filter((value): value is string => typeof value === "string")
      : [];
    if (row.source_kind === "rss" && row.enabled) urls.forEach((url) => rssFeedUrls.add(url));
    if (row.source_kind === "manual_url" && row.enabled) urls.forEach((url) => manualUrls.add(url));
    if (row.source_kind === "youtube" && row.enabled) youtubeEnabled = true;
  }
  return { rssFeedUrls: [...rssFeedUrls], manualUrls: [...manualUrls], youtubeEnabled };
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function projectByClientRef(projects: Project[]) {
  return new Map(projects.map((project) => [project.id, project]));
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
}

function monitorLifecyclePayload(monitor: MonitoringQuery) {
  const scheduleFrequency = monitor.scheduleFrequency === "daily" || monitor.scheduleFrequency === "weekly"
    ? monitor.scheduleFrequency
    : "manual";
  const scheduleHour = Number.isInteger(monitor.scheduleHour) && monitor.scheduleHour >= 0 && monitor.scheduleHour <= 23
    ? monitor.scheduleHour
    : 9;
  const scheduleWeekday = Number.isInteger(monitor.scheduleWeekday) && monitor.scheduleWeekday >= 0 && monitor.scheduleWeekday <= 6
    ? monitor.scheduleWeekday
    : 1;
  const retentionDays = monitor.retentionDays === 90 || monitor.retentionDays === 180 || monitor.retentionDays === 365
    ? monitor.retentionDays
    : null;
  return {
    schedule_frequency: scheduleFrequency,
    schedule_hour: scheduleHour,
    schedule_weekday: scheduleWeekday,
    schedule_timezone: monitor.scheduleTimezone?.trim() || "UTC",
    schedule_enabled: monitor.status !== "paused" && scheduleFrequency !== "manual" && monitor.scheduleEnabled,
    retention_days: retentionDays,
    retention_enabled: monitor.status !== "paused"
      && scheduleFrequency !== "manual"
      && monitor.scheduleEnabled
      && retentionDays !== null
      && monitor.retentionEnabled,
  };
}

const connectorConfigDefinitions = [
  { sourceKind: "rss" as const, displayName: "RSS & Atom" },
  { sourceKind: "manual_url" as const, displayName: "Manual URL" },
  { sourceKind: "youtube" as const, displayName: "YouTube" },
];

async function syncProjectConnectorSettings(
  client: SiftSupabaseClient,
  projectId: string,
  settings: RadarConnectorSettings,
) {
  const rows = connectorConfigDefinitions.map(({ sourceKind, displayName }) => {
    const urls = sourceKind === "rss" ? settings.rssFeedUrls : sourceKind === "manual_url" ? settings.manualUrls : [];
    const enabled = sourceKind === "youtube" ? settings.youtubeEnabled : urls.length > 0;
    return {
      project_id: projectId,
      source_kind: sourceKind,
      display_name: displayName,
      enabled,
      mode: enabled ? "live" as const : "unavailable" as const,
      config: sourceKind === "youtube" ? {} : { urls },
    };
  });
  const { error } = await client.from("connector_configs")
    .upsert(rows, { onConflict: "project_id,source_kind,display_name" });
  if (error) throw new Error(`Radar source settings could not be saved: ${error.message}`);
}

export async function saveCloudRadarConnectorSettings(settings: RadarConnectorSettings) {
  const client = requireClient();
  const { data, error } = await client.from("monitoring_queries").select("project_id");
  if (error) throw new Error(`Radar monitor projects could not be checked: ${error.message}`);
  const projectIds = [...new Set((data ?? []).map((row) => String(row.project_id)))];
  for (const projectId of projectIds) await syncProjectConnectorSettings(client, projectId, settings);
}

async function listMonitorRows(client: SiftSupabaseClient, projectIds: string[]) {
  const rows: MonitoringQueryRow[] = [];
  let cursor: { createdAt: string; id: string } | null = null;
  while (true) {
    let query = client.from("monitoring_queries").select(monitorSelect).in("project_id", projectIds)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize);
    if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    const { data, error } = await query;
    if (error) throw new Error(`Radar monitors could not be loaded: ${error.message}`);
    const page = (data ?? []) as unknown as MonitoringQueryRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
    const last = page[page.length - 1];
    cursor = { createdAt: last.created_at, id: last.id };
  }
  return rows;
}

async function listMentionRows(client: SiftSupabaseClient, queryIds: string[]) {
  const rows: MentionRow[] = [];
  let cursor: { createdAt: string; id: string } | null = null;
  let truncated = false;
  while (rows.length < maximumMentionRows) {
    let query = client.from("mentions").select(mentionSelect).in("monitoring_query_id", queryIds)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize);
    if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    const { data, error } = await query;
    if (error) throw new Error(`Radar conversations could not be loaded: ${error.message}`);
    const page = (data ?? []) as unknown as MentionRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
    const last = page[page.length - 1];
    cursor = { createdAt: last.created_at, id: last.id };
    if (rows.length >= maximumMentionRows) truncated = true;
  }
  return { rows: rows.slice(0, maximumMentionRows), truncated };
}

async function listRunRows(client: SiftSupabaseClient, queryIds: string[]) {
  const { data, error } = await client.from("monitor_runs").select(runSelect).in("monitoring_query_id", queryIds)
    .order("started_at", { ascending: false }).order("id", { ascending: false }).limit(250);
  if (error) throw new Error(`Radar run history could not be loaded: ${error.message}`);
  return (data ?? []) as unknown as MonitorRunRow[];
}

async function monitorContext(client: SiftSupabaseClient, rows: MonitoringQueryRow[]) {
  const brandIds = [...new Set(rows.flatMap((row) => row.brand_id ? [row.brand_id] : []))];
  const brands = new Map<string, string>();
  if (brandIds.length) {
    const { data, error } = await client.from("brands").select("id,name").in("id", brandIds);
    if (error) throw new Error(`Radar brand context could not be loaded: ${error.message}`);
    for (const row of data ?? []) brands.set(String(row.id), row.name);
  }

  const competitors = new Map<string, string[]>();
  if (rows.length) {
    const { data, error } = await client.from("monitoring_query_competitors")
      .select("monitoring_query_id,competitors(name)")
      .in("monitoring_query_id", rows.map((row) => row.id));
    if (error) throw new Error(`Radar competitor context could not be loaded: ${error.message}`);
    for (const item of data ?? []) {
      const relation = item.competitors as unknown as { name?: string } | { name?: string }[] | null;
      const names = (Array.isArray(relation) ? relation : relation ? [relation] : []).flatMap((entry) => entry.name ? [entry.name] : []);
      competitors.set(String(item.monitoring_query_id), names);
    }
  }
  return { brands, competitors };
}

export async function listCloudRadar(projects: Project[]): Promise<RadarCloudSnapshot> {
  const client = requireClient();
  const { data: projectData, error: projectError } = await client.from("projects")
    .select("id,client_ref,name,description,market")
    .order("created_at", { ascending: true });
  if (projectError) throw new Error(`Radar workspace could not be loaded: ${projectError.message}`);
  const projectRows = (projectData ?? []) as unknown as RadarProjectRow[];
  if (!projectRows.length) return { monitors: [], mentionsByMonitor: {}, runs: [], truncated: false };

  const projectRefByCloudId = new Map(projectRows.map((row) => [row.id, row.client_ref ?? row.id]));
  for (const project of projects) if (project.cloudId) projectRefByCloudId.set(project.cloudId, project.id);
  const monitorRows = await listMonitorRows(client, projectRows.map((row) => row.id));
  if (!monitorRows.length) return { monitors: [], mentionsByMonitor: {}, runs: [], truncated: false };

  const { rows: mentionRows, truncated } = await listMentionRows(client, monitorRows.map((row) => row.id));
  const mentionCounts = new Map<string, number>();
  for (const row of mentionRows) if (row.monitoring_query_id) mentionCounts.set(row.monitoring_query_id, (mentionCounts.get(row.monitoring_query_id) ?? 0) + 1);
  const context = await monitorContext(client, monitorRows);
  const monitors = monitorRows.flatMap((row) => {
    const projectRef = projectRefByCloudId.get(row.project_id);
    if (!projectRef) return [];
    const totalMentionCount = Number(row.mentions?.[0]?.count ?? mentionCounts.get(row.id) ?? 0);
    return [monitoringQueryFromRow(row, projectRef, row.brand_id ? context.brands.get(row.brand_id) ?? "" : "", context.competitors.get(row.id) ?? [], totalMentionCount)];
  });
  const monitorByCloudId = new Map(monitors.flatMap((monitor) => monitor.cloudId ? [[monitor.cloudId, monitor] as const] : []));
  const mentionsByMonitor: Record<string, RadarMention[]> = {};
  for (const row of mentionRows) {
    const monitor = row.monitoring_query_id ? monitorByCloudId.get(row.monitoring_query_id) : undefined;
    if (!monitor) continue;
    (mentionsByMonitor[monitor.id] ??= []).push(radarMentionFromRow(row, monitor));
  }
  for (const mentions of Object.values(mentionsByMonitor)) mentions.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const runRows = await listRunRows(client, monitorRows.map((row) => row.id));
  const runs = runRows.flatMap((row) => {
    const monitor = monitorByCloudId.get(row.monitoring_query_id);
    return monitor ? [monitorRunFromRow(row, monitor.id)] : [];
  });
  return { monitors, mentionsByMonitor, runs, truncated };
}

export async function getCloudRadarMonitorSummary(
  monitorId: string,
  bounds: DateBounds,
  topic?: string,
): Promise<RadarMonitorSummary> {
  const client = requireClient();
  const { data, error } = await client.rpc("radar_monitor_summary", {
    p_monitor_id: monitorId,
    p_start: bounds.start.toISOString(),
    p_end: bounds.end.toISOString(),
    p_previous_start: bounds.previousStart.toISOString(),
    p_previous_end: bounds.previousEnd.toISOString(),
    p_topic: topic?.trim() || undefined,
  });
  if (error) throw new Error(`Radar analytics could not be calculated: ${error.message}`);
  const row = (data ?? [])[0] as unknown as RadarMonitorSummaryRow | undefined;
  if (!row) throw new Error("Radar analytics did not return a coverage summary.");
  return radarMonitorSummaryFromRow(row);
}

export async function getCloudRadarMonitorAnalysis(
  monitorId: string,
  monitorClientId: string,
  bounds: DateBounds,
  range: DateRangeKey,
  topic?: string,
): Promise<RadarMonitorAnalysis> {
  const client = requireClient();
  const { data, error } = await client.rpc("radar_monitor_analysis", {
    p_monitor_id: monitorId,
    p_start: bounds.start.toISOString(),
    p_end: bounds.end.toISOString(),
    p_previous_start: bounds.previousStart.toISOString(),
    p_previous_end: bounds.previousEnd.toISOString(),
    p_bucket_seconds: Math.round(radarBucketMilliseconds(range, bounds.start, bounds.end) / 1000),
    p_topic: topic?.trim() || undefined,
  });
  if (error) throw new Error(`Radar timelines could not be calculated: ${error.message}`);
  const row = (data ?? [])[0] as unknown as RadarMonitorAnalysisRow | undefined;
  if (!row) throw new Error("Radar timelines did not return an analysis result.");
  return radarMonitorAnalysisFromRow(row, monitorClientId, range);
}

async function ensureRadarProject(client: SiftSupabaseClient, monitor: MonitoringQuery, project?: Project) {
  if (project) {
    if (!project.cloudId) throw new Error("Move the selected project to the cloud before creating this monitor.");
    return project.cloudId;
  }
  const { data: existing, error: lookupError } = await client.from("projects").select("id").eq("client_ref", internalRadarProjectRef).maybeSingle();
  if (lookupError) throw new Error(`Personal Radar could not be checked: ${lookupError.message}`);
  if (existing?.id) return String(existing.id);
  const { data, error } = await client.from("projects").insert({
    client_ref: internalRadarProjectRef,
    name: "Personal Radar",
    description: "Internal workspace for monitors that are not assigned to a project.",
    market: monitor.market || null,
  }).select("id").single();
  if (error || !data?.id) throw new Error(`Personal Radar could not be created: ${error?.message ?? "No record was returned."}`);
  return String(data.id);
}

async function ensureNamedContext(client: SiftSupabaseClient, table: "brands" | "competitors", projectId: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) return "";
  const { data: rows, error } = await client.from(table).select("id,name").eq("project_id", projectId);
  if (error) throw new Error(`Radar context could not be checked: ${error.message}`);
  const existing = rows?.find((row) => row.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase());
  if (existing?.id) return String(existing.id);
  const { data, error: insertError } = await client.from(table).insert({ project_id: projectId, name: cleanName, metadata: { sift_origin: "radar_monitor" } }).select("id").single();
  if (insertError || !data?.id) throw new Error(`Radar context could not be saved: ${insertError?.message ?? "No record was returned."}`);
  return String(data.id);
}

async function syncMonitorCompetitors(client: SiftSupabaseClient, queryId: string, projectId: string, names: string[]) {
  const competitorIds: string[] = [];
  for (const name of names) competitorIds.push(await ensureNamedContext(client, "competitors", projectId, name));
  const { error: deleteError } = await client.from("monitoring_query_competitors").delete().eq("monitoring_query_id", queryId);
  if (deleteError) throw new Error(`Monitor competitors could not be updated: ${deleteError.message}`);
  if (!competitorIds.length) return;
  const { error } = await client.from("monitoring_query_competitors").insert(competitorIds.map((competitorId) => ({ monitoring_query_id: queryId, competitor_id: competitorId })));
  if (error) throw new Error(`Monitor competitors could not be saved: ${error.message}`);
}

export async function createCloudMonitor(monitor: MonitoringQuery, projects: Project[], connectorSettings?: RadarConnectorSettings) {
  const client = requireClient();
  const project = monitor.projectId ? projectByClientRef(projects).get(monitor.projectId) : undefined;
  if (monitor.projectId && !project) throw new Error("The selected project is no longer available.");
  const projectId = await ensureRadarProject(client, monitor, project);
  const brandId = monitor.brand ? await ensureNamedContext(client, "brands", projectId, monitor.brand) : null;
  const clientRef = monitor.clientRef || monitor.id;
  const payload = {
    project_id: projectId,
    client_ref: clientRef,
    brand_id: brandId || null,
    name: monitor.name.trim(),
    query: monitor.query,
    description: monitor.description.trim() || null,
    parsed_query: {
      includeAll: monitor.builder.includeAll,
      includeAny: monitor.builder.includeAny,
      exclude: monitor.builder.exclude,
    },
    enabled: monitor.status !== "paused",
    ...monitorLifecyclePayload(monitor),
    platform_filters: monitor.sources.map(sourceToDatabase),
    language: monitor.language === "Any language" ? null : monitor.language,
    market: monitor.market.trim() || null,
    keywords: monitor.keywords,
    excluded_keywords: monitor.excludedKeywords,
  };
  const { data, error } = await client.from("monitoring_queries")
    .upsert(payload, { onConflict: "project_id,client_ref" })
    .select(monitorSelect).single();
  if (error || !data) throw new Error(`Monitor could not be saved: ${error?.message ?? "No record was returned."}`);
  if (connectorSettings) await syncProjectConnectorSettings(client, projectId, connectorSettings);
  await syncMonitorCompetitors(client, String(data.id), projectId, monitor.competitors);
  return monitoringQueryFromRow(data as unknown as MonitoringQueryRow, project?.id ?? internalRadarProjectRef, monitor.brand, monitor.competitors, 0);
}

export async function updateCloudMonitor(monitor: MonitoringQuery, projects: Project[], connectorSettings?: RadarConnectorSettings) {
  if (!monitor.cloudId || !monitor.cloudProjectId) throw new Error("This monitor has not been verified in the cloud yet.");
  const client = requireClient();
  const project = monitor.projectId ? projectByClientRef(projects).get(monitor.projectId) : undefined;
  if (monitor.projectId && !project) throw new Error("The selected project is no longer available.");
  const requestedProjectId = project?.cloudId ?? monitor.cloudProjectId;
  if (requestedProjectId !== monitor.cloudProjectId) throw new Error("Moving a monitor between projects is not supported yet.");

  const brandId = monitor.brand ? await ensureNamedContext(client, "brands", monitor.cloudProjectId, monitor.brand) : null;
  const payload = {
    brand_id: brandId || null,
    name: monitor.name.trim(),
    query: monitor.query,
    description: monitor.description.trim() || null,
    parsed_query: {
      includeAll: monitor.builder.includeAll,
      includeAny: monitor.builder.includeAny,
      exclude: monitor.builder.exclude,
    },
    enabled: monitor.status !== "paused",
    ...monitorLifecyclePayload(monitor),
    platform_filters: monitor.sources.map(sourceToDatabase),
    language: monitor.language === "Any language" ? null : monitor.language,
    market: monitor.market.trim() || null,
    keywords: monitor.keywords,
    excluded_keywords: monitor.excludedKeywords,
  };
  const { data, error } = await client.from("monitoring_queries")
    .update(payload)
    .eq("id", monitor.cloudId)
    .eq("project_id", monitor.cloudProjectId)
    .select(monitorSelect)
    .single();
  if (error || !data) throw new Error(`Monitor could not be updated: ${error?.message ?? "No record was returned."}`);
  if (connectorSettings) await syncProjectConnectorSettings(client, monitor.cloudProjectId, connectorSettings);
  await syncMonitorCompetitors(client, monitor.cloudId, monitor.cloudProjectId, monitor.competitors);
  const updated = monitoringQueryFromRow(
    data as unknown as MonitoringQueryRow,
    project?.id ?? internalRadarProjectRef,
    monitor.brand,
    monitor.competitors,
    monitor.dataMode === "live" ? 1 : 0,
  );
  return { ...updated, dataMode: monitor.dataMode };
}

export async function saveCloudMonitorRun(run: MonitorRun, monitor: MonitoringQuery) {
  if (!shouldPersistMonitorRun(run) || !monitor.cloudId || !monitor.cloudProjectId) return;
  const client = requireClient();
  const clientRef = run.clientRef || run.id;
  const { error } = await client.from("monitor_runs").upsert({
    project_id: monitor.cloudProjectId,
    monitoring_query_id: monitor.cloudId,
    client_ref: clientRef,
    status: run.status,
    started_at: run.startedAt,
    completed_at: run.completedAt ?? null,
    mentions_fetched: run.mentionsFetched,
    mentions_created: run.mentionsCreated,
    mentions_updated: run.mentionsUpdated ?? 0,
    error_message: run.error ?? null,
    run_metadata: {
      sourceResults: run.sourceResults,
      duplicatesRemoved: run.duplicatesRemoved ?? 0,
      durationMs: run.durationMs,
      quota: run.quota,
      incremental: run.incremental ?? false,
      cursorAdvancedSources: run.cursorAdvancedSources ?? [],
      triggerType: run.triggerType ?? "manual",
    },
  }, { onConflict: "monitoring_query_id,client_ref" });
  if (error) throw new Error(`Monitor run could not be saved: ${error.message}`);
}

async function ensureSource(client: SiftSupabaseClient, projectId: string, source: RadarSource) {
  const kind = sourceToDatabase(source);
  const externalId = `radar:${source}`;
  const { data: existing, error } = await client.from("sources").select("id").eq("project_id", projectId).eq("kind", kind).eq("external_id", externalId).maybeSingle();
  if (error) throw new Error(`Radar source could not be checked: ${error.message}`);
  if (existing?.id) return String(existing.id);
  const { data, error: insertError } = await client.from("sources").insert({ project_id: projectId, kind, external_id: externalId, name: source === "rss" ? "RSS feeds" : source === "manual" ? "Manual URL imports" : source, mode: "live" }).select("id").single();
  if (insertError || !data?.id) throw new Error(`Radar source could not be saved: ${insertError?.message ?? "No record was returned."}`);
  return String(data.id);
}

async function importMention(client: SiftSupabaseClient, mention: RadarMention, monitor: MonitoringQuery) {
  if (!monitor.cloudId || !monitor.cloudProjectId) throw new Error("The monitor was not verified before its conversations were imported.");
  const sourceId = await ensureSource(client, monitor.cloudProjectId, mention.platform);
  const { data, error } = await client.from("mentions").upsert({
    project_id: monitor.cloudProjectId,
    monitoring_query_id: monitor.cloudId,
    source_id: sourceId,
    platform: sourceToDatabase(mention.platform),
    external_id: mention.externalId,
    author: mention.author,
    content: mention.content,
    url: mention.url ?? null,
    published_at: mention.publishedAt,
    likes: mention.likes,
    comments: mention.comments,
    shares: mention.shares,
    views: mention.views,
    engagement: mention.engagement,
    language: mention.language,
    sentiment: mention.sentiment,
    sentiment_score: mention.sentimentScore,
    keywords: mention.keywords,
    is_important: false,
    metadata: { ...mention.metadata, sift_origin: "browser_import" },
  }, { onConflict: "source_id,external_id" }).select("id").single();
  if (error || !data?.id) throw new Error(`A Radar conversation could not be imported: ${error?.message ?? "No record was returned."}`);

  if (!mention.topics.length) return;
  const { data: topics, error: topicError } = await client.from("topics").upsert(
    mention.topics.map((name) => ({ project_id: monitor.cloudProjectId!, name, slug: slugify(name) })),
    { onConflict: "project_id,slug" },
  ).select("id");
  if (topicError) throw new Error(`Radar topics could not be imported: ${topicError.message}`);
  if (topics?.length) {
    const { error: linkError } = await client.from("mention_topics").upsert(topics.map((topic) => ({ mention_id: data.id, topic_id: topic.id, confidence: 0.7 })), { onConflict: "mention_id,topic_id" });
    if (linkError) throw new Error(`Radar topic evidence could not be linked: ${linkError.message}`);
  }
}

export async function importLocalRadar(payload: LocalRadarPayload, projects: Project[]) {
  const client = requireClient();
  const cloudMonitors = new Map<string, MonitoringQuery>();
  for (const monitor of payload.monitors) cloudMonitors.set(monitor.id, await createCloudMonitor(monitor, projects));
  for (const [monitorId, mentions] of Object.entries(payload.mentionsByMonitor)) {
    const monitor = cloudMonitors.get(monitorId);
    if (!monitor) throw new Error("A local conversation references a monitor that is not available for import.");
    for (const mention of mentions) await importMention(client, mention, monitor);
  }
  for (const run of payload.runs) {
    const monitor = cloudMonitors.get(run.monitorId);
    if (monitor) await saveCloudMonitorRun({ ...run, clientRef: run.clientRef || run.id }, monitor);
  }
  return listCloudRadar(projects);
}
