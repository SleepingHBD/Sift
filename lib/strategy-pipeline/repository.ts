import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { nextSessionOrigin } from "./model";
import type {
  AttachStrategyEvidenceInput,
  SaveStrategyStageInput,
  StrategyAiInputOption,
  StrategyEvidenceSource,
  StrategyInputType,
  StrategySessionDetail,
  StrategySessionInputRecord,
  StrategySessionOrigin,
  StrategySessionSummary,
  StrategyStageRecord,
  StrategyStageSourceRecord,
} from "./types";

type SessionRow = Database["public"]["Tables"]["strategy_sessions"]["Row"];
type StageRow = Database["public"]["Tables"]["strategy_stages"]["Row"];
type StageSourceRow = Database["public"]["Tables"]["strategy_stage_sources"]["Row"];
type SessionInputRow = Database["public"]["Tables"]["strategy_session_inputs"]["Row"];

const sessionSelect = "id,project_id,title,status,origin,created_at,updated_at";
const stageSelect = "id,session_id,project_id,stage,content,claim_type,position,status,confidence,research_gaps,created_at,updated_at";
const sourceSelect = "id,stage_id,project_id,evidence_type,evidence_id,relationship,excerpt,rationale,created_at";
const inputSelect = "id,session_id,project_id,input_type,input_id,role,rationale,created_at";

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

function sessionFromRow(row: Pick<SessionRow, "id" | "project_id" | "title" | "status" | "origin" | "created_at" | "updated_at">): StrategySessionSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status as StrategySessionSummary["status"],
    origin: row.origin as StrategySessionOrigin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sourceExcerpt(value: string | null, length = 260) {
  if (!value) return null;
  const clean = value.trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}

export async function listStrategySessions(projectId: string): Promise<StrategySessionSummary[]> {
  const client = requireClient();
  const { data, error } = await client.from("strategy_sessions")
    .select(sessionSelect)
    .eq("project_id", projectId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Insight sessions could not be loaded: ${error.message}`);
  return (data ?? []).map((row) => sessionFromRow(row as SessionRow));
}

export async function createStrategySession(projectId: string, title: string): Promise<StrategySessionSummary> {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Give this insight session a name.");
  const client = requireClient();
  const { data, error } = await client.from("strategy_sessions").insert({
    project_id: projectId,
    title: cleanTitle,
    status: "active",
    origin: "strategist",
    source_scope: {},
  }).select(sessionSelect).single();
  if (error || !data) throw new Error(`Insight session could not be created: ${error?.message ?? "No record was returned."}`);
  return sessionFromRow(data as SessionRow);
}

async function evidenceSources(projectId: string, rows: StageSourceRow[]) {
  const client = requireClient();
  const ids = (kind: StageSourceRow["evidence_type"]) => rows.filter((row) => row.evidence_type === kind).map((row) => row.evidence_id);
  const mentionIds = ids("mention");
  const researchIds = ids("research");
  const inspirationIds = ids("inspiration");
  const [mentions, research, inspiration] = await Promise.all([
    mentionIds.length
      ? client.from("mentions").select("id,project_id,author,content,url,published_at,created_at,platform").eq("project_id", projectId).in("id", mentionIds)
      : Promise.resolve({ data: [], error: null }),
    researchIds.length
      ? client.from("research_items").select("id,project_id,title,author,publication,key_findings,notes,url,published_at,created_at").eq("project_id", projectId).in("id", researchIds)
      : Promise.resolve({ data: [], error: null }),
    inspirationIds.length
      ? client.from("inspiration_items").select("id,project_id,title,brand_name,extracted_text,notes,url,created_at,item_type").eq("project_id", projectId).in("id", inspirationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (mentions.error) throw new Error(`Mention evidence could not be loaded: ${mentions.error.message}`);
  if (research.error) throw new Error(`Research evidence could not be loaded: ${research.error.message}`);
  if (inspiration.error) throw new Error(`Inspiration evidence could not be loaded: ${inspiration.error.message}`);

  const sources = new Map<string, StrategyEvidenceSource>();
  for (const item of mentions.data ?? []) {
    sources.set(`mention:${item.id}`, {
      id: item.id,
      projectId: item.project_id,
      kind: "mention",
      title: item.author ? `${item.platform} · ${item.author}` : `${item.platform} conversation`,
      author: item.author,
      sourceLabel: item.platform,
      excerpt: sourceExcerpt(item.content),
      originalUrl: item.url,
      capturedAt: item.published_at ?? item.created_at,
    });
  }
  for (const item of research.data ?? []) {
    sources.set(`research:${item.id}`, {
      id: item.id,
      projectId: item.project_id,
      kind: "research",
      title: item.title,
      author: item.author,
      sourceLabel: item.publication || "Research",
      excerpt: sourceExcerpt(item.key_findings || item.notes),
      originalUrl: item.url,
      capturedAt: item.published_at ?? item.created_at,
    });
  }
  for (const item of inspiration.data ?? []) {
    sources.set(`inspiration:${item.id}`, {
      id: item.id,
      projectId: item.project_id,
      kind: "inspiration",
      title: item.title,
      author: null,
      sourceLabel: item.brand_name || item.item_type || "Inspiration",
      excerpt: sourceExcerpt(item.extracted_text || item.notes),
      originalUrl: item.url,
      capturedAt: item.created_at,
    });
  }
  return sources;
}

function unavailableSource(row: StageSourceRow): StrategyEvidenceSource {
  return {
    id: row.evidence_id,
    projectId: row.project_id,
    kind: row.evidence_type as StrategyEvidenceSource["kind"],
    title: "Source unavailable",
    author: null,
    sourceLabel: row.evidence_type,
    excerpt: row.excerpt,
    originalUrl: null,
    capturedAt: row.created_at,
  };
}

async function inputRecords(projectId: string, rows: SessionInputRow[]): Promise<StrategySessionInputRecord[]> {
  if (!rows.length) return [];
  const client = requireClient();
  const signalIds = rows.filter((row) => row.input_type === "signal").map((row) => row.input_id);
  const aiIds = rows.filter((row) => row.input_type === "ai_message").map((row) => row.input_id);
  const [signals, messages] = await Promise.all([
    signalIds.length
      ? client.from("signals").select("id,title,observation").eq("project_id", projectId).in("id", signalIds)
      : Promise.resolve({ data: [], error: null }),
    aiIds.length
      ? client.from("ai_messages").select("id,content").in("id", aiIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (signals.error) throw new Error(`Signal inputs could not be loaded: ${signals.error.message}`);
  if (messages.error) throw new Error(`Strategy AI inputs could not be loaded: ${messages.error.message}`);
  const signalMap = new Map((signals.data ?? []).map((item) => [item.id, item]));
  const messageMap = new Map((messages.data ?? []).map((item) => [item.id, item]));
  return rows.map((row) => {
    const signal = row.input_type === "signal" ? signalMap.get(row.input_id) : undefined;
    const message = row.input_type === "ai_message" ? messageMap.get(row.input_id) : undefined;
    return {
      id: row.id,
      projectId: row.project_id,
      sessionId: row.session_id,
      inputType: row.input_type as StrategyInputType,
      inputId: row.input_id,
      role: row.role as StrategySessionInputRecord["role"],
      rationale: row.rationale,
      title: signal?.title ?? (message ? "Saved Strategy AI analysis" : "Unavailable starting point"),
      excerpt: signal?.observation ?? sourceExcerpt(message?.content ?? null, 220) ?? "This starting point is no longer available.",
      createdAt: row.created_at,
    };
  });
}

export async function loadStrategySession(sessionId: string, projectId: string): Promise<StrategySessionDetail> {
  const client = requireClient();
  const [sessionResult, stageResult, inputResult] = await Promise.all([
    client.from("strategy_sessions").select(sessionSelect).eq("id", sessionId).eq("project_id", projectId).single(),
    client.from("strategy_stages").select(stageSelect).eq("session_id", sessionId).eq("project_id", projectId).order("position"),
    client.from("strategy_session_inputs").select(inputSelect).eq("session_id", sessionId).eq("project_id", projectId).order("created_at"),
  ]);
  if (sessionResult.error || !sessionResult.data) throw new Error(`Insight session could not be loaded: ${sessionResult.error?.message ?? "No record was returned."}`);
  if (stageResult.error) throw new Error(`Insight stages could not be loaded: ${stageResult.error.message}`);
  if (inputResult.error) throw new Error(`Starting points could not be loaded: ${inputResult.error.message}`);
  const stageRows = (stageResult.data ?? []) as StageRow[];
  const stageIds = stageRows.map((row) => row.id);
  const stageSourcesResult = stageIds.length
    ? await client.from("strategy_stage_sources").select(sourceSelect).eq("project_id", projectId).in("stage_id", stageIds).order("created_at")
    : { data: [], error: null };
  if (stageSourcesResult.error) throw new Error(`Stage evidence could not be loaded: ${stageSourcesResult.error.message}`);
  const sourceRows = (stageSourcesResult.data ?? []) as StageSourceRow[];
  const sourceMap = await evidenceSources(projectId, sourceRows);
  const sourcesByStage = new Map<string, StrategyStageSourceRecord[]>();
  for (const row of sourceRows) {
    const source = sourceMap.get(`${row.evidence_type}:${row.evidence_id}`) ?? unavailableSource(row);
    const mapped: StrategyStageSourceRecord = {
      id: row.id,
      stageId: row.stage_id,
      projectId: row.project_id,
      relationship: row.relationship as StrategyStageSourceRecord["relationship"],
      excerpt: row.excerpt,
      rationale: row.rationale,
      createdAt: row.created_at,
      source,
    };
    sourcesByStage.set(row.stage_id, [...(sourcesByStage.get(row.stage_id) ?? []), mapped]);
  }
  const stages: StrategyStageRecord[] = stageRows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    kind: row.stage as StrategyStageRecord["kind"],
    content: row.content,
    claimType: row.claim_type,
    position: row.position,
    status: row.status as StrategyStageRecord["status"],
    confidence: row.confidence as StrategyStageRecord["confidence"],
    researchGaps: row.research_gaps,
    sources: sourcesByStage.get(row.id) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return {
    ...sessionFromRow(sessionResult.data as SessionRow),
    stages,
    inputs: await inputRecords(projectId, (inputResult.data ?? []) as SessionInputRow[]),
  };
}

export async function saveStrategyStage(input: SaveStrategyStageInput): Promise<StrategyStageRecord> {
  const client = requireClient();
  const payload = {
    project_id: input.projectId,
    session_id: input.sessionId,
    stage: input.kind,
    content: input.content.trim(),
    claim_type: input.claimType,
    position: input.position,
    confidence: input.confidence,
    research_gaps: input.researchGaps,
  };
  if (!payload.content) throw new Error("Write the claim before saving this stage.");
  const result = input.id
    ? await client.from("strategy_stages").update(payload).eq("id", input.id).eq("project_id", input.projectId).select(stageSelect).single()
    : await client.from("strategy_stages").insert(payload).select(stageSelect).single();
  if (result.error || !result.data) throw new Error(`This stage could not be saved: ${result.error?.message ?? "No record was returned."}`);
  const row = result.data as StageRow;
  return {
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    kind: row.stage as StrategyStageRecord["kind"],
    content: row.content,
    claimType: row.claim_type,
    position: row.position,
    status: row.status as StrategyStageRecord["status"],
    confidence: row.confidence as StrategyStageRecord["confidence"],
    researchGaps: row.research_gaps,
    sources: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function attachStrategyEvidence(input: AttachStrategyEvidenceInput): Promise<void> {
  if (!input.evidence.cloudId) throw new Error("Only evidence saved in this cloud workspace can be attached.");
  const client = requireClient();
  const { error } = await client.from("strategy_stage_sources").insert({
    project_id: input.projectId,
    stage_id: input.stageId,
    evidence_type: input.evidence.kind,
    evidence_id: input.evidence.cloudId,
    relationship: input.relationship,
    excerpt: input.evidence.excerpt ?? input.evidence.originalContent,
    rationale: input.rationale?.trim() || null,
  });
  if (error?.code === "23505") throw new Error("This evidence is already linked to the selected stage in that role.");
  if (error) throw new Error(`Evidence could not be attached: ${error.message}`);
}

export async function removeStrategyEvidence(sourceLinkId: string, projectId: string, stageId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("strategy_stage_sources")
    .delete()
    .eq("id", sourceLinkId)
    .eq("project_id", projectId)
    .eq("stage_id", stageId);
  if (error) throw new Error(`Evidence link could not be removed: ${error.message}`);
}

export async function listStrategyAiInputOptions(projectId: string): Promise<StrategyAiInputOption[]> {
  const client = requireClient();
  const conversations = await client.from("ai_conversations")
    .select("id,title,created_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });
  if (conversations.error) throw new Error(`Saved Strategy AI work could not be loaded: ${conversations.error.message}`);
  const ids = (conversations.data ?? []).map((row) => row.id);
  if (!ids.length) return [];
  const messages = await client.from("ai_messages")
    .select("id,conversation_id,content,created_at")
    .in("conversation_id", ids)
    .eq("role", "assistant")
    .order("created_at", { ascending: false });
  if (messages.error) throw new Error(`Saved Strategy AI responses could not be loaded: ${messages.error.message}`);
  const conversationMap = new Map((conversations.data ?? []).map((row) => [row.id, row]));
  return (messages.data ?? []).map((message) => ({
    id: message.id,
    conversationId: message.conversation_id,
    title: conversationMap.get(message.conversation_id)?.title || "Saved Strategy AI analysis",
    excerpt: sourceExcerpt(message.content, 230) || "Saved assistant analysis",
    createdAt: message.created_at,
  }));
}

export async function addStrategySessionInput(
  session: StrategySessionSummary,
  inputType: StrategyInputType,
  inputId: string,
): Promise<void> {
  const client = requireClient();
  const inserted = await client.from("strategy_session_inputs").insert({
    project_id: session.projectId,
    session_id: session.id,
    input_type: inputType,
    input_id: inputId,
    role: "starting_point",
  });
  if (inserted.error?.code === "23505") throw new Error("This starting point is already part of the session.");
  if (inserted.error) throw new Error(`Starting point could not be added: ${inserted.error.message}`);
  const origin = nextSessionOrigin(session.origin, inputType);
  if (origin !== session.origin) {
    const updated = await client.from("strategy_sessions").update({ origin }).eq("id", session.id).eq("project_id", session.projectId);
    if (updated.error) throw new Error(`The starting point was saved, but its session label could not be updated: ${updated.error.message}`);
  }
}
