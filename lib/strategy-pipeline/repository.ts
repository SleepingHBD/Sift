import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { EvidenceReference } from "@/lib/evidence/reference";
import { nextSessionOrigin } from "./model";
import type {
  AttachStrategyEvidenceInput,
  CreateStrategyAlternativeInput,
  CreateStrategyDependencyInput,
  SaveStrategyStageInput,
  SaveStrategyConnectionInput,
  StrategyAiInputOption,
  StrategyAlternativeStatus,
  StrategyConfidence,
  StrategyEvidenceSource,
  StrategyInputType,
  StrategySessionDetail,
  StrategySessionConnectionRecord,
  StrategySessionInputRecord,
  StrategySessionOrigin,
  StrategySessionPieceRecord,
  StrategySessionSummary,
  StrategySessionTurnRecord,
  StrategyTurnSourceRecord,
  StrategyPieceSourceRecord,
  StrategyPieceStatus,
  StrategyStageAlternativeRecord,
  StrategyStageDependencyRecord,
  StrategyStageRecord,
  StrategyStageRevisionRecord,
  StrategyStageSourceRecord,
  StrategyStageStatus,
  UpdateStrategyAlternativeInput,
} from "./types";

type SessionRow = Database["public"]["Tables"]["strategy_sessions"]["Row"];
type StageRow = Database["public"]["Tables"]["strategy_stages"]["Row"];
type StageSourceRow = Database["public"]["Tables"]["strategy_stage_sources"]["Row"];
type SessionInputRow = Database["public"]["Tables"]["strategy_session_inputs"]["Row"];
type SessionConnectionRow = Database["public"]["Tables"]["strategy_session_connections"]["Row"];
type SessionTurnRow = Database["public"]["Tables"]["strategy_session_turns"]["Row"];
type SessionTurnSourceRow = Database["public"]["Tables"]["strategy_session_turn_sources"]["Row"];
type SessionPieceRow = Database["public"]["Tables"]["strategy_session_pieces"]["Row"];
type SessionPieceSourceRow = Database["public"]["Tables"]["strategy_session_piece_sources"]["Row"];
type AlternativeRow = Database["public"]["Tables"]["strategy_stage_alternatives"]["Row"];
type DependencyRow = Database["public"]["Tables"]["strategy_stage_dependencies"]["Row"];
type RevisionRow = Database["public"]["Tables"]["strategy_stage_revisions"]["Row"];

const sessionSelect = "id,project_id,created_by,title,status,origin,created_at,updated_at";
const stageSelect = "id,session_id,project_id,stage,content,claim_type,position,status,confidence,research_gaps,approval_note,approved_at,approved_by,created_at,updated_at";
const sourceSelect = "id,stage_id,project_id,evidence_type,evidence_id,relationship,excerpt,rationale,created_at";
const inputSelect = "id,session_id,project_id,input_type,input_id,role,rationale,created_at";
const connectionSelect = "id,project_id,session_id,source_turn_id,target_turn_id,relationship,origin,status,rationale,factors,created_by,created_at,updated_at";
const turnSelect = "id,project_id,session_id,role,origin,content,metadata,ai_message_id,created_by,created_at";
const turnSourceSelect = "id,project_id,session_id,turn_id,evidence_type,evidence_id,relationship,excerpt,rationale,created_at";
const pieceSelect = "id,project_id,session_id,source_turn_id,kind,origin,external_ref,content,why_it_matters,confidence,caveat,status,created_by,created_at,updated_at";
const pieceSourceSelect = "id,project_id,piece_id,evidence_type,evidence_id,relationship,excerpt,rationale,created_at";
const alternativeSelect = "id,project_id,stage_id,content,claim_type,confidence,status,rationale,research_gaps,created_at,updated_at";
const dependencySelect = "id,project_id,stage_id,depends_on_stage_id,relationship,rationale,created_at";
const revisionSelect = "id,project_id,stage_id,alternative_id,entity_type,change_kind,changed_fields,before_state,after_state,changed_by,created_at";

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

function sessionFromRow(row: Pick<SessionRow, "id" | "project_id" | "created_by" | "title" | "status" | "origin" | "created_at" | "updated_at">): StrategySessionSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    createdBy: row.created_by,
    title: row.title,
    status: row.status as StrategySessionSummary["status"],
    origin: row.origin as StrategySessionOrigin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function turnFromRow(row: SessionTurnRow, sources: StrategyTurnSourceRecord[] = []): StrategySessionTurnRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    role: row.role as StrategySessionTurnRecord["role"],
    origin: row.origin as StrategySessionTurnRecord["origin"],
    content: row.content,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {},
    aiMessageId: row.ai_message_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    sources,
  };
}

function connectionFromRow(row: SessionConnectionRow): StrategySessionConnectionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    sourceTurnId: row.source_turn_id,
    targetTurnId: row.target_turn_id,
    relationship: row.relationship as StrategySessionConnectionRecord["relationship"],
    origin: row.origin as StrategySessionConnectionRecord["origin"],
    status: row.status as StrategySessionConnectionRecord["status"],
    rationale: row.rationale,
    factors: row.factors,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sourceExcerpt(value: string | null, length = 260) {
  if (!value) return null;
  const clean = value.trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}

function jsonRecord(value: Database["public"]["Tables"]["strategy_stage_revisions"]["Row"]["before_state"]): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function alternativeFromRow(row: AlternativeRow): StrategyStageAlternativeRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    stageId: row.stage_id,
    content: row.content,
    claimType: row.claim_type,
    confidence: row.confidence as StrategyStageAlternativeRecord["confidence"],
    status: row.status as StrategyStageAlternativeRecord["status"],
    rationale: row.rationale,
    researchGaps: row.research_gaps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dependencyFromRow(row: DependencyRow): StrategyStageDependencyRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    stageId: row.stage_id,
    dependsOnStageId: row.depends_on_stage_id,
    relationship: row.relationship as StrategyStageDependencyRecord["relationship"],
    rationale: row.rationale,
    createdAt: row.created_at,
  };
}

function revisionFromRow(row: RevisionRow): StrategyStageRevisionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    stageId: row.stage_id,
    alternativeId: row.alternative_id,
    entityType: row.entity_type as StrategyStageRevisionRecord["entityType"],
    changeKind: row.change_kind as StrategyStageRevisionRecord["changeKind"],
    changedFields: row.changed_fields,
    beforeState: jsonRecord(row.before_state),
    afterState: jsonRecord(row.after_state),
    changedBy: row.changed_by,
    createdAt: row.created_at,
  };
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

export async function renameStrategySession(
  sessionId: string,
  projectId: string,
  title: string,
): Promise<StrategySessionSummary> {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Give this notebook page a name.");
  if (cleanTitle.length > 200) throw new Error("Keep the page name to 200 characters or fewer.");
  const client = requireClient();
  const { data, error } = await client.from("strategy_sessions")
    .update({ title: cleanTitle })
    .eq("id", sessionId)
    .eq("project_id", projectId)
    .select(sessionSelect)
    .single();
  if (error || !data) throw new Error(`This notebook page could not be renamed: ${error?.message ?? "No page was returned."}`);
  return sessionFromRow(data as SessionRow);
}

export async function startStrategyConversation(projectId: string, openingMessage: string): Promise<StrategySessionSummary> {
  const cleanMessage = openingMessage.trim();
  if (!cleanMessage) throw new Error("Tell Sift what you are trying to understand.");
  const client = requireClient();
  const started = await client.rpc("start_strategy_conversation", {
    p_project_id: projectId,
    p_opening_message: cleanMessage,
  });
  if (started.error || !started.data) {
    throw new Error(`Strategy conversation could not be started: ${started.error?.message ?? "No session was returned."}`);
  }
  const session = await client.from("strategy_sessions")
    .select(sessionSelect)
    .eq("id", started.data)
    .eq("project_id", projectId)
    .single();
  if (session.error || !session.data) {
    throw new Error(`The conversation was created, but it could not be loaded: ${session.error?.message ?? "No session was returned."}`);
  }
  return sessionFromRow(session.data as SessionRow);
}

export async function addStrategyConversationTurn(
  sessionId: string,
  projectId: string,
  content: string,
  sources: EvidenceReference[] = [],
): Promise<StrategySessionTurnRecord> {
  const cleanContent = content.trim();
  if (!cleanContent && !sources.length) throw new Error("Write a thought or attach a source before saving.");
  if (sources.length > 12) throw new Error("Attach no more than 12 sources to one notebook entry.");
  if (sources.some((source) => !source.cloudId)) throw new Error("Only evidence saved in this cloud workspace can be attached.");
  const client = requireClient();
  const payload = sources.map((source) => ({
    kind: source.kind,
    id: source.cloudId!,
    excerpt: source.excerpt ?? source.originalContent,
  })) as unknown as Json;
  const created = await client.rpc("add_strategy_conversation_turn", {
    p_session_id: sessionId,
    p_project_id: projectId,
    p_content: cleanContent,
    p_sources: payload,
  });
  if (created.error || !created.data) throw new Error(`This notebook entry could not be saved: ${created.error?.message ?? "No turn was returned."}`);
  const [turnResult, sourceResult] = await Promise.all([
    client.from("strategy_session_turns").select(turnSelect).eq("id", created.data).eq("project_id", projectId).single(),
    client.from("strategy_session_turn_sources").select(turnSourceSelect).eq("turn_id", created.data).eq("project_id", projectId).order("created_at"),
  ]);
  if (turnResult.error || !turnResult.data) throw new Error(`The notebook entry was saved, but could not be reloaded: ${turnResult.error?.message ?? "No turn was returned."}`);
  if (sourceResult.error) throw new Error(`The notebook entry was saved, but its sources could not be reloaded: ${sourceResult.error.message}`);
  const sourceRows = (sourceResult.data ?? []) as SessionTurnSourceRow[];
  const sourceMap = await evidenceSources(projectId, sourceRows);
  return turnFromRow(turnResult.data as SessionTurnRow, sourceRows.map((row) => turnSourceFromRow(row, sourceMap)));
}

export async function deleteStrategyConversationTurn(
  turnId: string,
  sessionId: string,
  projectId: string,
): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.rpc("delete_strategy_conversation_turn", {
    p_turn_id: turnId,
    p_session_id: sessionId,
    p_project_id: projectId,
  });
  if (error || !data) throw new Error(`This notebook entry could not be deleted: ${error?.message ?? "No deleted entry was returned."}`);
  return data;
}

export async function deleteNotebookPage(
  sessionId: string,
  projectId: string,
): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.rpc("delete_notebook_page", {
    p_session_id: sessionId,
    p_project_id: projectId,
  });
  if (error || !data) throw new Error(`This notebook page could not be deleted: ${error?.message ?? "No deleted page was returned."}`);
  return data;
}

export async function saveStrategySessionConnection(
  input: SaveStrategyConnectionInput,
): Promise<StrategySessionConnectionRecord> {
  const client = requireClient();
  const saved = await client.rpc("set_strategy_session_connection", {
    p_session_id: input.sessionId,
    p_project_id: input.projectId,
    p_source_turn_id: input.sourceTurnId,
    p_target_turn_id: input.targetTurnId,
    p_relationship: input.relationship,
    p_origin: input.origin,
    p_status: input.status,
    p_rationale: input.rationale?.trim() || undefined,
    p_factors: input.factors ?? [],
  });
  if (saved.error || !saved.data) throw new Error(`This connection could not be saved: ${saved.error?.message ?? "No connection was returned."}`);
  const result = await client.from("strategy_session_connections")
    .select(connectionSelect)
    .eq("id", saved.data)
    .eq("project_id", input.projectId)
    .single();
  if (result.error || !result.data) throw new Error(`The connection was saved, but could not be reloaded: ${result.error?.message ?? "No connection was returned."}`);
  return connectionFromRow(result.data as SessionConnectionRow);
}

export async function removeStrategySessionConnection(
  connectionId: string,
  sessionId: string,
  projectId: string,
): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.rpc("remove_strategy_session_connection", {
    p_connection_id: connectionId,
    p_session_id: sessionId,
    p_project_id: projectId,
  });
  if (error || !data) throw new Error(`This connection could not be removed: ${error?.message ?? "No connection was returned."}`);
  return data;
}

type EvidenceLinkRow = Pick<StageSourceRow, "project_id" | "evidence_type" | "evidence_id" | "excerpt" | "created_at">;

async function evidenceSources(projectId: string, rows: EvidenceLinkRow[]) {
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

function unavailableSource(row: EvidenceLinkRow): StrategyEvidenceSource {
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

function turnSourceFromRow(row: SessionTurnSourceRow, sources: Map<string, StrategyEvidenceSource>): StrategyTurnSourceRecord {
  return {
    id: row.id,
    turnId: row.turn_id,
    projectId: row.project_id,
    relationship: "context",
    excerpt: row.excerpt,
    rationale: row.rationale,
    createdAt: row.created_at,
    source: sources.get(`${row.evidence_type}:${row.evidence_id}`) ?? unavailableSource(row),
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
  const [sessionResult, stageResult, inputResult, turnResult, pieceResult, connectionResult] = await Promise.all([
    client.from("strategy_sessions").select(sessionSelect).eq("id", sessionId).eq("project_id", projectId).single(),
    client.from("strategy_stages").select(stageSelect).eq("session_id", sessionId).eq("project_id", projectId).order("position"),
    client.from("strategy_session_inputs").select(inputSelect).eq("session_id", sessionId).eq("project_id", projectId).order("created_at"),
    client.from("strategy_session_turns").select(turnSelect).eq("session_id", sessionId).eq("project_id", projectId).order("created_at", { ascending: true }).order("id", { ascending: true }),
    client.from("strategy_session_pieces").select(pieceSelect).eq("session_id", sessionId).eq("project_id", projectId).order("created_at", { ascending: true }).order("id", { ascending: true }),
    client.from("strategy_session_connections").select(connectionSelect).eq("session_id", sessionId).eq("project_id", projectId).order("created_at", { ascending: true }).order("id", { ascending: true }),
  ]);
  if (sessionResult.error || !sessionResult.data) throw new Error(`Insight session could not be loaded: ${sessionResult.error?.message ?? "No record was returned."}`);
  if (stageResult.error) throw new Error(`Insight stages could not be loaded: ${stageResult.error.message}`);
  if (inputResult.error) throw new Error(`Starting points could not be loaded: ${inputResult.error.message}`);
  if (turnResult.error) throw new Error(`Strategy conversation could not be loaded: ${turnResult.error.message}`);
  if (pieceResult.error) throw new Error(`Strategy working pieces could not be loaded: ${pieceResult.error.message}`);
  if (connectionResult.error) throw new Error(`Notebook connections could not be loaded: ${connectionResult.error.message}`);
  const stageRows = (stageResult.data ?? []) as StageRow[];
  const turnRows = (turnResult.data ?? []) as SessionTurnRow[];
  const turnIds = turnRows.map((row) => row.id);
  const turnSourcesResult = turnIds.length
    ? await client.from("strategy_session_turn_sources").select(turnSourceSelect).eq("project_id", projectId).in("turn_id", turnIds).order("created_at")
    : { data: [], error: null };
  if (turnSourcesResult.error) throw new Error(`Notebook sources could not be loaded: ${turnSourcesResult.error.message}`);
  const turnSourceRows = (turnSourcesResult.data ?? []) as SessionTurnSourceRow[];
  const turnEvidenceMap = await evidenceSources(projectId, turnSourceRows);
  const sourcesByTurn = new Map<string, StrategyTurnSourceRecord[]>();
  for (const row of turnSourceRows) {
    sourcesByTurn.set(row.turn_id, [
      ...(sourcesByTurn.get(row.turn_id) ?? []),
      turnSourceFromRow(row, turnEvidenceMap),
    ]);
  }
  const stageIds = stageRows.map((row) => row.id);
  const [stageSourcesResult, alternativesResult, dependenciesResult, revisionsResult] = stageIds.length
    ? await Promise.all([
      client.from("strategy_stage_sources").select(sourceSelect).eq("project_id", projectId).in("stage_id", stageIds).is("alternative_id", null).order("created_at"),
      client.from("strategy_stage_alternatives").select(alternativeSelect).eq("project_id", projectId).in("stage_id", stageIds).order("created_at"),
      client.from("strategy_stage_dependencies").select(dependencySelect).eq("project_id", projectId).in("stage_id", stageIds).order("created_at"),
      client.from("strategy_stage_revisions").select(revisionSelect).eq("project_id", projectId).in("stage_id", stageIds).order("created_at", { ascending: false }),
    ])
    : [
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
  if (stageSourcesResult.error) throw new Error(`Stage evidence could not be loaded: ${stageSourcesResult.error.message}`);
  if (alternativesResult.error) throw new Error(`Alternative interpretations could not be loaded: ${alternativesResult.error.message}`);
  if (dependenciesResult.error) throw new Error(`Stage dependencies could not be loaded: ${dependenciesResult.error.message}`);
  if (revisionsResult.error) throw new Error(`Stage revision history could not be loaded: ${revisionsResult.error.message}`);
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
  const alternativesByStage = new Map<string, StrategyStageAlternativeRecord[]>();
  for (const row of (alternativesResult.data ?? []) as AlternativeRow[]) {
    alternativesByStage.set(row.stage_id, [...(alternativesByStage.get(row.stage_id) ?? []), alternativeFromRow(row)]);
  }
  const dependenciesByStage = new Map<string, StrategyStageDependencyRecord[]>();
  for (const row of (dependenciesResult.data ?? []) as DependencyRow[]) {
    dependenciesByStage.set(row.stage_id, [...(dependenciesByStage.get(row.stage_id) ?? []), dependencyFromRow(row)]);
  }
  const revisionsByStage = new Map<string, StrategyStageRevisionRecord[]>();
  for (const row of (revisionsResult.data ?? []) as RevisionRow[]) {
    revisionsByStage.set(row.stage_id, [...(revisionsByStage.get(row.stage_id) ?? []), revisionFromRow(row)]);
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
    approvalNote: row.approval_note,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    sources: sourcesByStage.get(row.id) ?? [],
    alternatives: alternativesByStage.get(row.id) ?? [],
    dependencies: dependenciesByStage.get(row.id) ?? [],
    revisions: revisionsByStage.get(row.id) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  const pieceRows = (pieceResult.data ?? []) as SessionPieceRow[];
  const pieceIds = pieceRows.map((row) => row.id);
  const pieceSourcesResult = pieceIds.length
    ? await client.from("strategy_session_piece_sources").select(pieceSourceSelect).eq("project_id", projectId).in("piece_id", pieceIds).order("created_at")
    : { data: [], error: null };
  if (pieceSourcesResult.error) throw new Error(`Working-piece evidence could not be loaded: ${pieceSourcesResult.error.message}`);
  const pieceSourceRows = (pieceSourcesResult.data ?? []) as SessionPieceSourceRow[];
  const pieceEvidenceMap = await evidenceSources(projectId, pieceSourceRows);
  const sourcesByPiece = new Map<string, StrategyPieceSourceRecord[]>();
  for (const row of pieceSourceRows) {
    const source = pieceEvidenceMap.get(`${row.evidence_type}:${row.evidence_id}`) ?? unavailableSource(row);
    const mapped: StrategyPieceSourceRecord = {
      id: row.id,
      pieceId: row.piece_id,
      projectId: row.project_id,
      relationship: row.relationship as StrategyPieceSourceRecord["relationship"],
      excerpt: row.excerpt,
      rationale: row.rationale,
      createdAt: row.created_at,
      source,
    };
    sourcesByPiece.set(row.piece_id, [...(sourcesByPiece.get(row.piece_id) ?? []), mapped]);
  }
  const pieces: StrategySessionPieceRecord[] = pieceRows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    sourceTurnId: row.source_turn_id,
    kind: row.kind as StrategySessionPieceRecord["kind"],
    origin: row.origin as StrategySessionPieceRecord["origin"],
    externalRef: row.external_ref,
    content: row.content,
    whyItMatters: row.why_it_matters,
    confidence: row.confidence as StrategySessionPieceRecord["confidence"],
    caveat: row.caveat,
    status: row.status as StrategySessionPieceRecord["status"],
    sources: sourcesByPiece.get(row.id) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return {
    ...sessionFromRow(sessionResult.data as SessionRow),
    stages,
    inputs: await inputRecords(projectId, (inputResult.data ?? []) as SessionInputRow[]),
    turns: turnRows.map((row) => turnFromRow(row, sourcesByTurn.get(row.id) ?? [])),
    pieces,
    connections: ((connectionResult.data ?? []) as SessionConnectionRow[]).map(connectionFromRow),
  };
}

export async function updateStrategyPieceStatus(
  pieceId: string,
  projectId: string,
  status: StrategyPieceStatus,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("strategy_session_pieces")
    .update({ status })
    .eq("id", pieceId)
    .eq("project_id", projectId);
  if (error) throw new Error(`This working piece could not be updated: ${error.message}`);
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
    approvalNote: row.approval_note,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    sources: [],
    alternatives: [],
    dependencies: [],
    revisions: [],
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

export async function updateStrategyStageUncertainty(
  stageId: string,
  projectId: string,
  confidence: StrategyConfidence,
  researchGaps: string[],
): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("strategy_stages")
    .update({ confidence, research_gaps: researchGaps })
    .eq("id", stageId)
    .eq("project_id", projectId);
  if (error) throw new Error(`Confidence and research gaps could not be saved: ${error.message}`);
}

export async function setStrategyStageStatus(
  stageId: string,
  projectId: string,
  status: StrategyStageStatus,
  approvalNote?: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("strategy_stages")
    .update({ status, approval_note: status === "approved" ? approvalNote?.trim() || null : null })
    .eq("id", stageId)
    .eq("project_id", projectId);
  if (error) throw new Error(`Stage status could not be changed: ${error.message}`);
}

export async function createStrategyAlternative(input: CreateStrategyAlternativeInput): Promise<void> {
  const content = input.content.trim();
  if (!content) throw new Error("Write the alternative interpretation before saving it.");
  const client = requireClient();
  const { error } = await client.from("strategy_stage_alternatives").insert({
    project_id: input.projectId,
    stage_id: input.stageId,
    content,
    claim_type: input.claimType,
    confidence: input.confidence,
    rationale: input.rationale?.trim() || null,
    research_gaps: input.researchGaps,
    status: "considering",
  });
  if (error) throw new Error(`Alternative interpretation could not be saved: ${error.message}`);
}

export async function updateStrategyAlternative(input: UpdateStrategyAlternativeInput): Promise<void> {
  const content = input.content.trim();
  if (!content) throw new Error("An alternative interpretation cannot be empty.");
  const client = requireClient();
  const { error } = await client.from("strategy_stage_alternatives")
    .update({
      content,
      claim_type: input.claimType,
      confidence: input.confidence,
      rationale: input.rationale?.trim() || null,
      research_gaps: input.researchGaps,
      status: input.status,
    })
    .eq("id", input.id)
    .eq("stage_id", input.stageId)
    .eq("project_id", input.projectId);
  if (error) throw new Error(`Alternative interpretation could not be updated: ${error.message}`);
}

export async function addStrategyDependency(input: CreateStrategyDependencyInput): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("strategy_stage_dependencies").insert({
    project_id: input.projectId,
    stage_id: input.stageId,
    depends_on_stage_id: input.dependsOnStageId,
    relationship: input.relationship,
    rationale: input.rationale?.trim() || null,
  });
  if (error?.code === "23505") throw new Error("That dependency is already recorded for this stage.");
  if (error) throw new Error(`Stage dependency could not be saved: ${error.message}`);
}

export async function ensureStrategyDependency(input: CreateStrategyDependencyInput): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("strategy_stage_dependencies").upsert({
    project_id: input.projectId,
    stage_id: input.stageId,
    depends_on_stage_id: input.dependsOnStageId,
    relationship: input.relationship,
    rationale: input.rationale?.trim() || null,
  }, {
    onConflict: "stage_id,depends_on_stage_id,relationship",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`Required stage dependency could not be preserved: ${error.message}`);
}

export async function removeStrategyDependency(dependencyId: string, projectId: string, stageId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("strategy_stage_dependencies")
    .delete()
    .eq("id", dependencyId)
    .eq("project_id", projectId)
    .eq("stage_id", stageId);
  if (error) throw new Error(`Stage dependency could not be removed: ${error.message}`);
}

export async function updateStrategyAlternativeStatus(
  alternativeId: string,
  projectId: string,
  stageId: string,
  status: StrategyAlternativeStatus,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("strategy_stage_alternatives")
    .update({ status })
    .eq("id", alternativeId)
    .eq("project_id", projectId)
    .eq("stage_id", stageId);
  if (error) throw new Error(`Alternative status could not be changed: ${error.message}`);
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
