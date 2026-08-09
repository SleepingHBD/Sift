// The Edge Function runtime supplies the authenticated, RLS-scoped client.
// deno-lint-ignore-file no-explicit-any
import { processMention, slugify } from "./processing.ts";
import type { MonitorCursor } from "./cursor.ts";
import type { CollectionDiagnostics, MonitorInput, NormalizedMention, ProjectInput, SourceRunResult } from "./types.ts";

const runLeaseMilliseconds = 3 * 60 * 1_000;

export interface CollectionRunContext {
  runId: string;
  projectId: string;
  queryId: string;
  previousCursor: unknown;
  cursorSourceRunId?: string;
}

export class MonitorRunConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("This monitor is already being collected. Wait for the active run to finish, then try again.");
    this.name = "MonitorRunConflictError";
  }
}

export async function beginCollectionRun(
  supabase: any,
  userId: string,
  monitor: MonitorInput,
  project: ProjectInput | null,
  startedAt: string,
): Promise<CollectionRunContext> {
  const projectId = await ensureProject(supabase, userId, monitor, project);
  const queryId = await ensureMonitoringQuery(supabase, projectId, monitor);
  const { error: recoveryError } = await supabase.from("monitor_runs").update({
    status: "failed",
    completed_at: startedAt,
    lease_expires_at: null,
    heartbeat_at: startedAt,
    error_message: "The previous collection stopped before completion. Its expired lease was recovered by the next run.",
    run_metadata: { recoveredAt: startedAt, recoveryReason: "expired_lease" },
  }).eq("monitoring_query_id", queryId).eq("status", "running")
    .or(`lease_expires_at.lt.${startedAt},lease_expires_at.is.null`);
  if (recoveryError) throw recoveryError;

  const { data: previous, error: cursorError } = await supabase.from("monitor_runs")
    .select("id,cursor")
    .eq("monitoring_query_id", queryId)
    .not("cursor", "is", null)
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cursorError) throw cursorError;

  const runId = crypto.randomUUID();
  const leaseExpiresAt = new Date(new Date(startedAt).getTime() + runLeaseMilliseconds).toISOString();
  const { error } = await supabase.from("monitor_runs").insert({
    id: runId,
    client_ref: runId,
    project_id: projectId,
    monitoring_query_id: queryId,
    status: "running",
    trigger_type: "manual",
    started_at: startedAt,
    heartbeat_at: startedAt,
    lease_expires_at: leaseExpiresAt,
    cursor: previous?.cursor ?? null,
    cursor_source_run_id: previous?.id ?? null,
    run_metadata: { triggerType: "manual", cursorSourceRunId: previous?.id ?? null },
  });
  if (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const message = typeof error === "object" && error && "message" in error ? String(error.message) : "";
    if (code === "23505" || message.includes("monitor_runs_one_active_query_idx")) throw new MonitorRunConflictError();
    throw error;
  }
  return {
    runId,
    projectId,
    queryId,
    previousCursor: previous?.cursor ?? null,
    cursorSourceRunId: previous?.id ?? undefined,
  };
}

export async function persistCollection(
  supabase: any,
  context: CollectionRunContext,
  mentions: NormalizedMention[],
  sourceResults: SourceRunResult[],
  diagnostics: CollectionDiagnostics,
  cursor: MonitorCursor,
  cursorAdvancedSources: string[],
  incremental: boolean,
) {
  const { projectId, queryId, runId } = context;
  const sourceIds = await ensureSources(supabase, projectId, mentions);
  const processed = mentions.map(processMention);
  const rows = processed.map(({ mention, sentiment, keywords }) => ({
    project_id: projectId,
    monitoring_query_id: queryId,
    source_id: sourceIds.get(mention.platform),
    platform: databaseSource(mention.platform),
    external_id: mention.externalId,
    author: mention.author,
    content: mention.content,
    url: mention.url,
    published_at: mention.publishedAt,
    likes: mention.likes,
    comments: mention.comments,
    shares: mention.shares,
    views: mention.views,
    engagement: mention.engagement,
    language: mention.language,
    sentiment: sentiment.label,
    sentiment_score: sentiment.score,
    keywords,
    metadata: mention.metadata,
  }));

  const existingKeys = await existingMentionKeys(supabase, rows);
  let mentionRows: { id: string; source_id: string; external_id: string }[] = [];
  if (rows.length) {
    const { data, error } = await supabase.from("mentions").upsert(rows, { onConflict: "source_id,external_id" }).select("id,source_id,external_id");
    if (error) throw error;
    mentionRows = data ?? [];
    await linkTopics(supabase, projectId, processed, mentionRows, sourceIds);
  }
  const mentionsUpdated = rows.filter((row) => existingKeys.has(mentionKey(row.source_id, row.external_id))).length;
  const mentionsCreated = rows.length - mentionsUpdated;

  await supabase.from("monitoring_queries").update({ last_run_at: new Date().toISOString(), enabled: true }).eq("id", queryId);
  const status = sourceResults.every((result) => result.status === "failed") ? "failed" : "completed";
  const completedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabase.from("monitor_runs").update({
    status,
    completed_at: completedAt,
    heartbeat_at: completedAt,
    lease_expires_at: null,
    mentions_fetched: diagnostics.mentionsFetched,
    mentions_created: mentionsCreated,
    mentions_updated: mentionsUpdated,
    error_message: status === "failed" ? sourceResults.map((result) => result.message).filter(Boolean).join(" ") : null,
    cursor,
    run_metadata: {
      sourceResults,
      duplicatesRemoved: diagnostics.duplicatesRemoved,
      durationMs: diagnostics.durationMs,
      quota: diagnostics.quota,
      triggerType: "manual",
      incremental,
      cursorAdvancedSources,
      cursorSourceRunId: context.cursorSourceRunId ?? null,
    },
  }).eq("id", runId).eq("status", "running").select("id").single();
  if (runError) throw runError;
  return { runId: run.id as string, projectId, queryId, mentionsCreated, mentionsUpdated };
}

export async function failCollectionRun(supabase: any, runId: string, errorMessage: string) {
  const completedAt = new Date().toISOString();
  const { error } = await supabase.from("monitor_runs").update({
    status: "failed",
    completed_at: completedAt,
    heartbeat_at: completedAt,
    lease_expires_at: null,
    error_message: errorMessage.slice(0, 2_000),
  }).eq("id", runId).eq("status", "running");
  if (error) console.error("Radar run failure could not be recorded", error);
}

async function existingMentionKeys(supabase: any, rows: { source_id: string; external_id: string }[]) {
  const keys = new Set<string>();
  const externalIdsBySource = new Map<string, string[]>();
  for (const row of rows) {
    const values = externalIdsBySource.get(row.source_id) ?? [];
    values.push(row.external_id);
    externalIdsBySource.set(row.source_id, values);
  }
  for (const [sourceId, externalIds] of externalIdsBySource) {
    for (let index = 0; index < externalIds.length; index += 200) {
      const { data, error } = await supabase.from("mentions")
        .select("source_id,external_id")
        .eq("source_id", sourceId)
        .in("external_id", externalIds.slice(index, index + 200));
      if (error) throw error;
      for (const row of data ?? []) keys.add(mentionKey(row.source_id, row.external_id));
    }
  }
  return keys;
}

function mentionKey(sourceId: string, externalId: string) {
  return `${sourceId}:${externalId}`;
}

export async function deleteStoredMonitor(
  supabase: any,
  userId: string,
  monitorId: string,
  project: ProjectInput | null,
) {
  const clientRef = project?.id || "personal-radar";
  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", userId)
    .eq("client_ref", clientRef)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!projectRow?.id) return { deleted: false, mentionsDeleted: 0 };

  const { data: queryRow, error: queryError } = await supabase
    .from("monitoring_queries")
    .select("id")
    .eq("project_id", projectRow.id)
    .eq("client_ref", monitorId)
    .maybeSingle();
  if (queryError) throw queryError;
  if (!queryRow?.id) return { deleted: false, mentionsDeleted: 0 };

  const { data: mentionRows, error: mentionsError } = await supabase
    .from("mentions")
    .select("id")
    .eq("project_id", projectRow.id)
    .eq("monitoring_query_id", queryRow.id);
  if (mentionsError) throw mentionsError;
  const mentionIds = (mentionRows ?? []).map((mention: { id: string }) => mention.id);

  if (mentionIds.length) {
    await deleteMentionReferences(supabase, projectRow.id, mentionIds);
    const { error } = await supabase.from("mentions").delete().in("id", mentionIds);
    if (error) throw error;
  }

  const { error: deleteError } = await supabase
    .from("monitoring_queries")
    .delete()
    .eq("id", queryRow.id)
    .eq("project_id", projectRow.id);
  if (deleteError) throw deleteError;
  return { deleted: true, mentionsDeleted: mentionIds.length };
}

async function deleteMentionReferences(supabase: any, projectId: string, mentionIds: string[]) {
  const operations = [
    supabase.from("saved_items").delete().eq("project_id", projectId).eq("item_type", "mention").in("item_id", mentionIds),
    supabase.from("item_tags").delete().eq("project_id", projectId).eq("item_type", "mention").in("item_id", mentionIds),
    supabase.from("insight_sources").delete().eq("source_type", "mention").in("source_id", mentionIds),
    supabase.from("brief_sources").delete().eq("source_type", "mention").in("source_id", mentionIds),
  ];
  for (const operation of operations) {
    const { error } = await operation;
    if (error) throw error;
  }
}

async function ensureProject(supabase: any, userId: string, monitor: MonitorInput, project: ProjectInput | null) {
  const clientRef = project?.id || "personal-radar";
  const { data: existing, error: selectError } = await supabase.from("projects").select("id").eq("owner_id", userId).eq("client_ref", clientRef).maybeSingle();
  if (selectError) throw selectError;
  if (existing?.id) return existing.id as string;
  const { data, error } = await supabase.from("projects").insert({
    owner_id: userId,
    client_ref: clientRef,
    name: project?.name || `${monitor.name} Radar`,
    description: project?.description || "Radar collection workspace",
    market: project?.market || monitor.market || null,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function ensureMonitoringQuery(supabase: any, projectId: string, monitor: MonitorInput) {
  const { data: existing, error: selectError } = await supabase.from("monitoring_queries").select("id").eq("project_id", projectId).eq("client_ref", monitor.id).maybeSingle();
  if (selectError) throw selectError;
  const values = {
    name: monitor.name,
    query: monitor.query,
    parsed_query: monitor.builder,
    language: monitor.language,
    market: monitor.market,
    platform_filters: monitor.sources.map(databaseSource),
    enabled: true,
  };
  if (existing?.id) {
    const { error } = await supabase.from("monitoring_queries").update(values).eq("id", existing.id);
    if (error) throw error;
    return existing.id as string;
  }
  const { data, error } = await supabase.from("monitoring_queries").insert({ ...values, project_id: projectId, client_ref: monitor.id }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function ensureSources(supabase: any, projectId: string, mentions: NormalizedMention[]) {
  const ids = new Map<string, string>();
  for (const platform of [...new Set(mentions.map((mention) => mention.platform))]) {
    const externalId = `radar:${platform}`;
    const kind = databaseSource(platform);
    const { data: existing, error: selectError } = await supabase.from("sources").select("id").eq("project_id", projectId).eq("kind", kind).eq("external_id", externalId).maybeSingle();
    if (selectError) throw selectError;
    if (existing?.id) {
      ids.set(platform, existing.id as string);
      continue;
    }
    const { data, error } = await supabase.from("sources").insert({ project_id: projectId, kind, name: sourceName(platform), external_id: externalId, mode: "live" }).select("id").single();
    if (error) throw error;
    ids.set(platform, data.id as string);
  }
  return ids;
}

async function linkTopics(
  supabase: any,
  projectId: string,
  processed: ReturnType<typeof processMention>[],
  mentionRows: { id: string; source_id: string; external_id: string }[],
  sourceIds: Map<string, string>,
) {
  const topicNames = [...new Set(processed.flatMap((item) => item.topics))];
  if (!topicNames.length) return;
  const { data: topicRows, error: topicError } = await supabase.from("topics").upsert(topicNames.map((name) => ({ project_id: projectId, name, slug: slugify(name) })), { onConflict: "project_id,slug" }).select("id,name");
  if (topicError) throw topicError;
  const topicIds = new Map((topicRows ?? []).map((topic: { id: string; name: string }) => [topic.name, topic.id]));
  const mentionIds = new Map(mentionRows.map((mention) => [mentionKey(mention.source_id, mention.external_id), mention.id]));
  const links = processed.flatMap((item) => item.topics.map((topic) => ({
    mention_id: mentionIds.get(mentionKey(sourceIds.get(item.mention.platform) ?? "", item.mention.externalId)),
    topic_id: topicIds.get(topic),
    confidence: 0.7,
  }))).filter((link) => link.mention_id && link.topic_id);
  if (!links.length) return;
  const { error } = await supabase.from("mention_topics").upsert(links, { onConflict: "mention_id,topic_id" });
  if (error) throw error;
}

function databaseSource(source: string) {
  return source === "manual" ? "manual_url" : source;
}

function sourceName(source: string) {
  return source === "rss" ? "RSS feeds" : source === "manual" ? "Manual URL imports" : "YouTube";
}
