// The Edge Function runtime supplies the authenticated, RLS-scoped client.
// deno-lint-ignore-file no-explicit-any
import { processMention, slugify } from "./processing.ts";
import type { MonitorInput, NormalizedMention, ProjectInput, SourceRunResult } from "./types.ts";

export async function persistCollection(
  supabase: any,
  userId: string,
  monitor: MonitorInput,
  project: ProjectInput | null,
  mentions: NormalizedMention[],
  sourceResults: SourceRunResult[],
  startedAt: string,
) {
  const projectId = await ensureProject(supabase, userId, monitor, project);
  const queryId = await ensureMonitoringQuery(supabase, projectId, monitor);
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

  let mentionRows: { id: string; external_id: string }[] = [];
  if (rows.length) {
    const { data, error } = await supabase.from("mentions").upsert(rows, { onConflict: "source_id,external_id" }).select("id,external_id");
    if (error) throw error;
    mentionRows = data ?? [];
    await linkTopics(supabase, projectId, processed, mentionRows);
  }

  await supabase.from("monitoring_queries").update({ last_run_at: new Date().toISOString(), enabled: true }).eq("id", queryId);
  const status = sourceResults.every((result) => result.status === "failed") ? "failed" : "completed";
  const { data: run, error: runError } = await supabase.from("monitor_runs").insert({
    project_id: projectId,
    monitoring_query_id: queryId,
    status,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    mentions_fetched: mentions.length,
    mentions_created: mentionRows.length,
    mentions_updated: 0,
    error_message: status === "failed" ? sourceResults.map((result) => result.message).filter(Boolean).join(" ") : null,
    run_metadata: { sourceResults },
  }).select("id").single();
  if (runError) throw runError;
  return { runId: run.id as string, projectId, queryId };
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

async function linkTopics(supabase: any, projectId: string, processed: ReturnType<typeof processMention>[], mentionRows: { id: string; external_id: string }[]) {
  const topicNames = [...new Set(processed.flatMap((item) => item.topics))];
  if (!topicNames.length) return;
  const { data: topicRows, error: topicError } = await supabase.from("topics").upsert(topicNames.map((name) => ({ project_id: projectId, name, slug: slugify(name) })), { onConflict: "project_id,slug" }).select("id,name");
  if (topicError) throw topicError;
  const topicIds = new Map((topicRows ?? []).map((topic: { id: string; name: string }) => [topic.name, topic.id]));
  const mentionIds = new Map(mentionRows.map((mention) => [mention.external_id, mention.id]));
  const links = processed.flatMap((item) => item.topics.map((topic) => ({ mention_id: mentionIds.get(item.mention.externalId), topic_id: topicIds.get(topic), confidence: 0.7 }))).filter((link) => link.mention_id && link.topic_id);
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
