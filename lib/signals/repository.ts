import { createBrowserSupabaseClient } from "../supabase/client.ts";
import type { Json } from "../supabase/database.types.ts";
import { searchEvidencePage } from "../evidence/search.ts";
import type { EvidenceReference } from "../evidence/reference.ts";
import { evidenceTopicSlug, normalizeEvidenceTopics } from "../evidence/topics.ts";
import { buildSignalAssessmentDraft } from "./assessment.ts";
import { signalFromRow, type SignalEvidenceCountRow, type SignalRow, type SignalSnapshotRow } from "./model.ts";
import type {
  AddSignalEvidenceInput,
  CreateSignalInput,
  SignalAssessmentFactorRecord,
  SignalEvidenceLink,
  SignalEvidenceRelationship,
  SignalEvidenceSource,
  SignalDeletionPreview,
  SignalRecord,
  SignalLineageRecord,
  SignalRevisionRecord,
  SignalSnapshotRecord,
  SignalStatus,
  SignalTopicOption,
  SplitSignalInput,
  UpdateSignalInput,
} from "./types.ts";

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

const signalSelect = "id,project_id,topic_id,title,observation,kind,status,movement,origin,scope_note,strategist_notes,analysis_changed_at,superseded_by_signal_id,promoted_trend_id,created_at,updated_at";
const signalEvidenceSelect = "id,signal_id,project_id,evidence_type,evidence_id,relationship,weight,rationale,created_at";
const signalSnapshotSelect = "id,signal_id,movement,evidence_sufficiency,strength_score,analysis_version,method,supporting_count,contradicting_count,source_diversity,author_diversity,growth_rate,recency_days,factor_breakdown,limitations,research_gaps,created_at";

interface SignalEvidenceRow {
  id: string;
  signal_id: string;
  project_id: string;
  evidence_type: SignalEvidenceSource["kind"];
  evidence_id: string;
  relationship: SignalEvidenceRelationship;
  weight: number;
  rationale: string | null;
  created_at: string;
}

interface MentionSourceRow {
  id: string;
  project_id: string;
  author: string | null;
  content: string;
  url: string | null;
  published_at: string | null;
  created_at: string;
  platform: string;
}

interface ResearchSourceRow {
  id: string;
  project_id: string;
  title: string;
  url: string | null;
  author: string | null;
  publication: string | null;
  key_findings: string | null;
  notes: string | null;
  metadata: Json;
  published_at: string | null;
  created_at: string;
}

interface InspirationSourceRow {
  id: string;
  project_id: string;
  title: string;
  url: string | null;
  brand_name: string | null;
  extracted_text: string | null;
  notes: string | null;
  item_type: string;
  created_at: string;
}

interface SignalSnapshotDetailRow extends SignalSnapshotRow {
  method: string;
  supporting_count: number;
  contradicting_count: number;
  source_diversity: number;
  author_diversity: number;
  growth_rate: number | null;
  recency_days: number | null;
  limitations: string[];
  research_gaps: string[];
}

function excerpt(value: string | null, length = 360) {
  if (!value) return null;
  const clean = value.trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}

function sourceLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function jsonRecord(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function jsonText(value: Json | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function snapshotFromRow(row: SignalSnapshotDetailRow): SignalSnapshotRecord {
  const factors = row.factor_breakdown && typeof row.factor_breakdown === "object" && !Array.isArray(row.factor_breakdown)
    ? row.factor_breakdown as unknown as Record<string, SignalAssessmentFactorRecord>
    : {};
  return {
    id: row.id,
    movement: row.movement,
    evidenceSufficiency: row.evidence_sufficiency,
    strengthScore: Number(row.strength_score),
    analysisVersion: row.analysis_version,
    method: row.method,
    supportingCount: row.supporting_count,
    contradictingCount: row.contradicting_count,
    sourceDiversity: row.source_diversity,
    authorDiversity: row.author_diversity,
    growthRate: row.growth_rate == null ? null : Number(row.growth_rate),
    recencyDays: row.recency_days == null ? null : Number(row.recency_days),
    factors,
    limitations: row.limitations ?? [],
    researchGaps: row.research_gaps ?? [],
    createdAt: row.created_at,
  };
}

export async function listCloudSignals(projectIds: string[]): Promise<SignalRecord[]> {
  if (!projectIds.length) return [];
  const client = requireClient();
  const [signalsResult, evidenceResult, snapshotsResult] = await Promise.all([
    client.from("signals").select(signalSelect).in("project_id", projectIds).order("updated_at", { ascending: false }),
    client.from("signal_evidence").select("signal_id,relationship").in("project_id", projectIds),
    client.from("signal_snapshots").select("id,signal_id,movement,evidence_sufficiency,strength_score,analysis_version,created_at").in("project_id", projectIds).order("created_at", { ascending: false }),
  ]);
  if (signalsResult.error) throw new Error(`Signals could not be loaded: ${signalsResult.error.message}`);
  if (evidenceResult.error) throw new Error(`Signal evidence could not be loaded: ${evidenceResult.error.message}`);
  if (snapshotsResult.error) throw new Error(`Signal assessments could not be loaded: ${snapshotsResult.error.message}`);

  const evidenceBySignal = new Map<string, SignalEvidenceCountRow[]>();
  for (const row of (evidenceResult.data ?? []) as SignalEvidenceCountRow[]) {
    evidenceBySignal.set(row.signal_id, [...(evidenceBySignal.get(row.signal_id) ?? []), row]);
  }
  const latestBySignal = new Map<string, SignalSnapshotRow>();
  for (const row of (snapshotsResult.data ?? []) as SignalSnapshotRow[]) {
    if (!latestBySignal.has(row.signal_id)) latestBySignal.set(row.signal_id, row);
  }

  return ((signalsResult.data ?? []) as SignalRow[]).map((row) =>
    signalFromRow(row, evidenceBySignal.get(row.id), latestBySignal.get(row.id) ?? null));
}

export async function createCloudSignal(input: CreateSignalInput): Promise<SignalRecord> {
  const client = requireClient();
  const { data, error } = await client.from("signals").insert({
    project_id: input.projectId,
    title: input.title.trim(),
    observation: input.observation.trim(),
    kind: input.kind,
    scope_note: input.scopeNote.trim(),
    strategist_notes: input.strategistNotes?.trim() || null,
  }).select(signalSelect).single();
  if (error || !data) throw new Error(`Signal could not be created: ${error?.message ?? "No record was returned."}`);
  return signalFromRow(data as SignalRow);
}
export async function updateCloudSignalStatus(signalId: string, status: SignalStatus): Promise<SignalRecord> {
  const client = requireClient();
  const { data, error } = await client.from("signals").update({ status }).eq("id", signalId).select(signalSelect).single();
  if (error || !data) throw new Error(`Signal status could not be changed: ${error?.message ?? "No record was returned."}`);
  return signalFromRow(data as SignalRow);
}

export async function updateCloudSignal(
  signalId: string,
  projectId: string,
  input: UpdateSignalInput,
): Promise<SignalRecord> {
  const client = requireClient();
  const { data, error } = await client.from("signals").update({
    title: input.title.trim(),
    observation: input.observation.trim(),
    kind: input.kind,
    scope_note: input.scopeNote.trim(),
    strategist_notes: input.strategistNotes.trim() || null,
    topic_id: input.topicId,
  }).eq("id", signalId).eq("project_id", projectId).select(signalSelect).single();
  if (error || !data) throw new Error(`Signal could not be updated: ${error?.message ?? "No record was returned."}`);
  return signalFromRow(data as SignalRow);
}

export async function listSignalTopics(projectId: string): Promise<SignalTopicOption[]> {
  const client = requireClient();
  const { data, error } = await client.from("topics").select("id,name").eq("project_id", projectId).order("name");
  if (error) throw new Error(`Signal topics could not be loaded: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

export async function ensureSignalTopic(projectId: string, rawName: string): Promise<SignalTopicOption> {
  const client = requireClient();
  const name = normalizeEvidenceTopics([rawName])[0];
  const slug = name ? evidenceTopicSlug(name) : "";
  if (!name || !slug) throw new Error("Enter a topic name.");
  const existing = await client.from("topics").select("id,name").eq("project_id", projectId).eq("slug", slug).maybeSingle();
  if (existing.error) throw new Error(`Topic could not be checked: ${existing.error.message}`);
  if (existing.data) return existing.data;
  const created = await client.from("topics").insert({ project_id: projectId, name, slug }).select("id,name").single();
  if (created.error || !created.data) {
    if (created.error?.code === "23505") {
      const raced = await client.from("topics").select("id,name").eq("project_id", projectId).eq("slug", slug).single();
      if (!raced.error && raced.data) return raced.data;
    }
    throw new Error(`Topic could not be created: ${created.error?.message ?? "No record was returned."}`);
  }
  return created.data;
}

function objectState(value: Json): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function listSignalRevisions(signalId: string, projectId: string): Promise<SignalRevisionRecord[]> {
  const client = requireClient();
  const { data, error } = await client.from("signal_revisions")
    .select("id,change_kind,changed_fields,before_state,after_state,created_at")
    .eq("signal_id", signalId).eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Signal history could not be loaded: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    changeKind: row.change_kind as SignalRevisionRecord["changeKind"],
    changedFields: row.changed_fields,
    beforeState: objectState(row.before_state),
    afterState: objectState(row.after_state),
    createdAt: row.created_at,
  }));
}

export async function listSignalLineage(signalId: string, projectId: string): Promise<SignalLineageRecord[]> {
  const client = requireClient();
  const { data, error } = await client.from("signal_lineage")
    .select("id,relationship,source_signal_id,target_signal_id,created_at")
    .eq("project_id", projectId)
    .or(`source_signal_id.eq.${signalId},target_signal_id.eq.${signalId}`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Signal lineage could not be loaded: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    relationship: row.relationship as SignalLineageRecord["relationship"],
    sourceSignalId: row.source_signal_id,
    targetSignalId: row.target_signal_id,
    createdAt: row.created_at,
  }));
}

export async function mergeCloudSignals(targetSignalId: string, sourceSignalIds: string[]): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("merge_signals", {
    p_target_signal_id: targetSignalId,
    p_source_signal_ids: sourceSignalIds,
  });
  if (error) throw new Error(`Signals could not be merged: ${error.message}`);
}

export async function splitCloudSignal(input: SplitSignalInput): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.rpc("split_signal", {
    p_source_signal_id: input.sourceSignalId,
    p_evidence_link_ids: input.evidenceLinkIds,
    p_title: input.title.trim(),
    p_observation: input.observation.trim(),
    p_kind: input.kind,
    p_scope_note: input.scopeNote.trim(),
    p_strategist_notes: input.strategistNotes.trim() || undefined,
    p_move_evidence: input.moveEvidence,
  });
  if (error || !data) throw new Error(`Signal could not be split: ${error?.message ?? "No record was returned."}`);
  return data;
}

export async function promoteCloudSignal(signalId: string): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.rpc("promote_signal_to_trend", { p_signal_id: signalId });
  if (error || !data) throw new Error(`Signal could not be promoted: ${error?.message ?? "No trend was returned."}`);
  return data;
}

export async function previewCloudSignalDeletion(signalId: string): Promise<SignalDeletionPreview> {
  const client = requireClient();
  const { data, error } = await client.rpc("preview_signal_deletion", { p_signal_id: signalId });
  const row = data?.[0];
  if (error || !row) throw new Error(`Signal deletion could not be checked: ${error?.message ?? "No preview was returned."}`);
  return {
    deletable: row.deletable,
    blockers: row.blockers ?? [],
    evidenceLinkCount: Number(row.evidence_link_count),
    assessmentCount: Number(row.assessment_count),
    revisionCount: Number(row.revision_count),
    lineageCount: Number(row.lineage_count),
  };
}

export async function deleteCloudSignal(signalId: string): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.rpc("delete_signal_candidate", { p_signal_id: signalId });
  if (error || !data) throw new Error(`Signal could not be deleted: ${error?.message ?? "No deleted record was returned."}`);
  return data;
}

export async function searchSignalEvidenceCandidates(projectId: string, search = ""): Promise<EvidenceReference[]> {
  const page = await searchEvidencePage({ projectId, search, sort: "newest", pageSize: 50 });
  return page.items.filter((item) => item.projectId === projectId);
}

export async function listSignalSnapshots(signalId: string, projectId: string): Promise<SignalSnapshotRecord[]> {
  const client = requireClient();
  const { data, error } = await client.from("signal_snapshots")
    .select(signalSnapshotSelect)
    .eq("signal_id", signalId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Signal assessments could not be loaded: ${error.message}`);
  return ((data ?? []) as SignalSnapshotDetailRow[]).map(snapshotFromRow);
}

export async function listSignalEvidence(signalId: string, projectId: string): Promise<SignalEvidenceLink[]> {
  const client = requireClient();
  const { data, error } = await client.from("signal_evidence")
    .select(signalEvidenceSelect)
    .eq("signal_id", signalId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Signal evidence could not be loaded: ${error.message}`);
  const rows = (data ?? []) as SignalEvidenceRow[];
  if (!rows.length) return [];

  const ids = (kind: SignalEvidenceSource["kind"]) => rows.filter((row) => row.evidence_type === kind).map((row) => row.evidence_id);
  const mentionIds = ids("mention");
  const researchIds = ids("research");
  const inspirationIds = ids("inspiration");
  const [mentionResult, researchResult, inspirationResult] = await Promise.all([
    mentionIds.length
      ? client.from("mentions").select("id,project_id,author,content,url,published_at,created_at,platform").eq("project_id", projectId).in("id", mentionIds)
      : Promise.resolve({ data: [], error: null }),
    researchIds.length
      ? client.from("research_items").select("id,project_id,title,url,author,publication,key_findings,notes,metadata,published_at,created_at").eq("project_id", projectId).in("id", researchIds)
      : Promise.resolve({ data: [], error: null }),
    inspirationIds.length
      ? client.from("inspiration_items").select("id,project_id,title,url,brand_name,extracted_text,notes,item_type,created_at").eq("project_id", projectId).in("id", inspirationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const sourceError = mentionResult.error ?? researchResult.error ?? inspirationResult.error;
  if (sourceError) throw new Error(`Signal source records could not be loaded: ${sourceError.message}`);

  const sources = new Map<string, SignalEvidenceSource>();
  for (const row of (mentionResult.data ?? []) as MentionSourceRow[]) {
    const label = sourceLabel(row.platform);
    sources.set(`mention:${row.id}`, {
      id: row.id,
      projectId: row.project_id,
      kind: "mention",
      title: row.author ? `${label} · ${row.author}` : `${label} mention`,
      author: row.author,
      sourceLabel: label,
      excerpt: excerpt(row.content),
      excerptOrigin: "source",
      originalUrl: row.url,
      publishedAt: row.published_at,
      capturedAt: row.created_at,
    });
  }
  for (const row of (researchResult.data ?? []) as ResearchSourceRow[]) {
    const metadata = jsonRecord(row.metadata);
    const sourceText = jsonText(metadata.source_text) ?? jsonText(metadata.sourceText) ?? jsonText(metadata.quoted_text) ?? jsonText(metadata.quotedText);
    const interpretation = row.key_findings?.trim() || null;
    const note = row.notes?.trim() || null;
    sources.set(`research:${row.id}`, {
      id: row.id,
      projectId: row.project_id,
      kind: "research",
      title: row.title,
      author: row.author,
      sourceLabel: row.publication || "Personal research",
      excerpt: excerpt(sourceText || interpretation || note),
      excerptOrigin: sourceText ? "source" : interpretation ? "interpretation" : note ? "notes" : null,
      originalUrl: row.url,
      publishedAt: row.published_at,
      capturedAt: row.created_at,
    });
  }
  for (const row of (inspirationResult.data ?? []) as InspirationSourceRow[]) {
    sources.set(`inspiration:${row.id}`, {
      id: row.id,
      projectId: row.project_id,
      kind: "inspiration",
      title: row.title,
      author: row.brand_name,
      sourceLabel: row.brand_name || sourceLabel(row.item_type),
      excerpt: excerpt(row.extracted_text || row.notes),
      excerptOrigin: row.extracted_text?.trim() ? "source" : row.notes?.trim() ? "notes" : null,
      originalUrl: row.url,
      publishedAt: null,
      capturedAt: row.created_at,
    });
  }

  return rows.map((row) => {
    const source = sources.get(`${row.evidence_type}:${row.evidence_id}`);
    if (!source) throw new Error("A linked source is unavailable or no longer belongs to this project.");
    return {
      id: row.id,
      signalId: row.signal_id,
      projectId: row.project_id,
      relationship: row.relationship,
      rationale: row.rationale ?? "",
      weight: Number(row.weight),
      createdAt: row.created_at,
      source,
    };
  });
}

export async function addSignalEvidence(input: AddSignalEvidenceInput): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("signal_evidence").insert({
    signal_id: input.signalId,
    project_id: input.projectId,
    evidence_type: input.evidenceType,
    evidence_id: input.evidenceId,
    relationship: input.relationship,
    rationale: input.rationale?.trim() || null,
  });
  if (error) {
    if (error.code === "23505") throw new Error("This source is already linked to the signal in that role.");
    throw new Error(`Evidence could not be linked: ${error.message}`);
  }
}

export async function updateSignalEvidence(
  linkId: string,
  signalId: string,
  projectId: string,
  changes: { relationship?: SignalEvidenceRelationship; rationale?: string },
): Promise<void> {
  const client = requireClient();
  const values: { relationship?: SignalEvidenceRelationship; rationale?: string | null } = {};
  if (changes.relationship) values.relationship = changes.relationship;
  if (changes.rationale !== undefined) values.rationale = changes.rationale.trim() || null;
  const { data, error } = await client.from("signal_evidence").update(values)
    .eq("id", linkId).eq("signal_id", signalId).eq("project_id", projectId).select("id").single();
  if (error || !data) throw new Error(`Evidence link could not be updated: ${error?.message ?? "No record was returned."}`);
}

export async function removeSignalEvidence(linkId: string, signalId: string, projectId: string): Promise<void> {
  const client = requireClient();
  const { data, error } = await client.from("signal_evidence").delete()
    .eq("id", linkId).eq("signal_id", signalId).eq("project_id", projectId).select("id").single();
  if (error || !data) throw new Error(`Evidence link could not be removed: ${error?.message ?? "No record was returned."}`);
}

export async function createSignalSnapshot(
  signalId: string,
  projectId: string,
  links: SignalEvidenceLink[],
  snapshots: SignalSnapshotRecord[],
  now = new Date(),
): Promise<SignalSnapshotRecord> {
  const client = requireClient();
  const { input, assessment } = buildSignalAssessmentDraft(links, snapshots, now);
  const { data, error } = await client.from("signal_snapshots").insert({
    signal_id: signalId,
    project_id: projectId,
    analysis_version: assessment.analysisVersion,
    method: "deterministic",
    movement: assessment.movement,
    evidence_sufficiency: assessment.evidenceSufficiency,
    strength_score: assessment.strengthScore,
    supporting_count: input.supportingEvidence,
    contradicting_count: input.contradictingEvidence,
    source_diversity: input.sourceDiversity,
    author_diversity: input.authorDiversity,
    growth_rate: input.recentGrowthPercent ?? null,
    recency_days: input.daysSinceNewestEvidence ?? null,
    factor_breakdown: assessment.factors as unknown as Json,
    limitations: assessment.limitations,
    research_gaps: assessment.researchGaps,
  }).select(signalSnapshotSelect).single();
  if (error || !data) throw new Error(`Assessment could not be created: ${error?.message ?? "No record was returned."}`);
  return snapshotFromRow(data as SignalSnapshotDetailRow);
}
