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
import type { MonitorRun, MonitoringQuery, RadarMention, RadarSource } from "@/lib/radar/types";
import type { Project } from "@/lib/types";

type SiftSupabaseClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

const internalRadarProjectRef = "personal-radar";
const monitorSelect = "id,client_ref,project_id,brand_id,name,query,description,parsed_query,enabled,platform_filters,language,market,keywords,excluded_keywords,created_at,last_run_at,mentions(count)";
const mentionSelect = "id,project_id,monitoring_query_id,platform,external_id,author,content,url,published_at,likes,comments,shares,views,engagement,language,sentiment,sentiment_score,keywords,metadata,is_important,review_status,reviewed_at,created_at,sources(name),mention_topics(topics(name))";
const runSelect = "id,client_ref,monitoring_query_id,status,started_at,completed_at,mentions_fetched,mentions_created,mentions_updated,error_message,run_metadata";
const pageSize = 500;
const maximumMentionRows = 5000;

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

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

function projectByClientRef(projects: Project[]) {
  return new Map(projects.map((project) => [project.id, project]));
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
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

export async function createCloudMonitor(monitor: MonitoringQuery, projects: Project[]) {
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
  await syncMonitorCompetitors(client, String(data.id), projectId, monitor.competitors);
  return monitoringQueryFromRow(data as unknown as MonitoringQueryRow, project?.id ?? internalRadarProjectRef, monitor.brand, monitor.competitors, 0);
}

export async function updateCloudMonitor(monitor: MonitoringQuery, projects: Project[]) {
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
