import { createBrowserSupabaseClient } from "../supabase/client.ts";
import { signalFromRow, type SignalEvidenceCountRow, type SignalRow, type SignalSnapshotRow } from "./model.ts";
import type { CreateSignalInput, SignalRecord, SignalStatus } from "./types.ts";

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

const signalSelect = "id,project_id,topic_id,title,observation,kind,status,movement,origin,scope_note,strategist_notes,created_at,updated_at";

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
