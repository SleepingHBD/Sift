import type { CsvEvidenceRow, CsvFieldMapping } from "./csv-import.ts";
import { createBrowserSupabaseClient } from "../supabase/client.ts";
import type { Json } from "../supabase/database.types.ts";

export type EvidenceImportDuplicatePolicy = "skip" | "import";
export type EvidenceImportRowStatus = "accepted" | "duplicate" | "rejected";

export interface EvidenceImportRun {
  id: string;
  projectId: string;
  clientRef: string;
  filename: string;
  duplicatePolicy: EvidenceImportDuplicatePolicy;
  status: "completed" | "completed_with_errors";
  totalRows: number;
  acceptedRows: number;
  duplicateRows: number;
  rejectedRows: number;
  fieldMapping: Record<string, unknown>;
  createdAt: string;
  completedAt: string;
}

export interface EvidenceImportRowResult {
  id: string;
  importRunId: string;
  rowNumber: number;
  status: EvidenceImportRowStatus;
  sourceTitle: string | null;
  researchItemId: string | null;
  duplicateOf: string | null;
  errorMessages: string[];
}

export interface EvidenceImportResult {
  run: EvidenceImportRun;
  rows: EvidenceImportRowResult[];
  retried: boolean;
}

export interface EvidenceImportHistoryEntry extends EvidenceImportRun {
  rows: EvidenceImportRowResult[];
}

export interface EvidenceCloudDuplicate {
  rowNumber: number;
  duplicateOf: string;
  reason: "same_content" | "same_url";
}

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

function importRunFromRow(row: {
  id: string;
  project_id: string;
  client_ref: string;
  filename: string;
  duplicate_policy: string;
  status: string;
  total_rows: number;
  accepted_rows: number;
  duplicate_rows: number;
  rejected_rows: number;
  field_mapping: Json;
  created_at: string;
  completed_at: string;
}): EvidenceImportRun {
  return {
    id: row.id,
    projectId: row.project_id,
    clientRef: row.client_ref,
    filename: row.filename,
    duplicatePolicy: row.duplicate_policy as EvidenceImportDuplicatePolicy,
    status: row.status as EvidenceImportRun["status"],
    totalRows: row.total_rows,
    acceptedRows: row.accepted_rows,
    duplicateRows: row.duplicate_rows,
    rejectedRows: row.rejected_rows,
    fieldMapping: row.field_mapping && typeof row.field_mapping === "object" && !Array.isArray(row.field_mapping)
      ? row.field_mapping as Record<string, unknown>
      : {},
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function importRowFromRow(row: {
  id: string;
  import_run_id: string;
  row_number: number;
  status: string;
  source_title: string | null;
  research_item_id: string | null;
  duplicate_of: string | null;
  error_messages: string[];
}): EvidenceImportRowResult {
  return {
    id: row.id,
    importRunId: row.import_run_id,
    rowNumber: row.row_number,
    status: row.status as EvidenceImportRowStatus,
    sourceTitle: row.source_title,
    researchItemId: row.research_item_id,
    duplicateOf: row.duplicate_of,
    errorMessages: row.error_messages,
  };
}

function serializeRows(rows: CsvEvidenceRow[]): Json {
  return rows.map((row) => ({
    rowNumber: row.rowNumber,
    title: row.title,
    url: row.url,
    author: row.author,
    publication: row.publication,
    publishedAt: row.publishedAt,
    itemType: row.itemType,
    sourceText: row.sourceText,
    notes: row.notes,
    keyFindings: row.keyFindings,
    collection: row.collection,
    tags: row.tags,
  }));
}

export async function previewEvidenceCsvDuplicates(projectId: string, rows: CsvEvidenceRow[]) {
  if (!projectId || !rows.length) return [];
  const client = requireClient();
  const { data, error } = await client.rpc("preview_evidence_csv_duplicates", {
    p_project_id: projectId,
    p_rows: serializeRows(rows),
  });
  if (error) throw new Error(`Existing evidence could not be checked: ${error.message}`);
  return (data ?? []).map((row): EvidenceCloudDuplicate => ({
    rowNumber: row.row_number,
    duplicateOf: row.duplicate_of,
    reason: row.reason as EvidenceCloudDuplicate["reason"],
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseImportResult(value: Json): EvidenceImportResult {
  if (!isRecord(value) || !isRecord(value.run) || !Array.isArray(value.rows)) {
    throw new Error("The evidence import completed without a readable audit result.");
  }
  const run = importRunFromRow(value.run as never);
  const rows = value.rows.filter(isRecord).map((row) => importRowFromRow(row as never));
  return { run, rows, retried: value.retried === true };
}

export async function importEvidenceCsv(input: {
  projectId: string;
  clientRef: string;
  filename: string;
  mapping: CsvFieldMapping;
  duplicatePolicy: EvidenceImportDuplicatePolicy;
  rows: CsvEvidenceRow[];
}) {
  const client = requireClient();
  const { data, error } = await client.rpc("import_evidence_csv", {
    p_project_id: input.projectId,
    p_client_ref: input.clientRef,
    p_filename: input.filename,
    p_field_mapping: input.mapping,
    p_duplicate_policy: input.duplicatePolicy,
    p_rows: serializeRows(input.rows),
  });
  if (error) throw new Error(`Evidence could not be imported: ${error.message}`);
  return parseImportResult(data);
}

export async function listEvidenceImportHistory(projectId?: string | null, limit = 12) {
  const client = requireClient();
  let query = client.from("evidence_import_runs")
    .select("id,project_id,client_ref,filename,duplicate_policy,status,total_rows,accepted_rows,duplicate_rows,rejected_rows,field_mapping,created_at,completed_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(25, limit)));
  if (projectId) query = query.eq("project_id", projectId);
  const { data: runs, error: runError } = await query;
  if (runError) throw new Error(`Import history could not be loaded: ${runError.message}`);
  if (!runs?.length) return [];

  const { data: rows, error: rowError } = await client.from("evidence_import_rows")
    .select("id,import_run_id,row_number,status,source_title,research_item_id,duplicate_of,error_messages")
    .in("import_run_id", runs.map((run) => run.id))
    .order("row_number", { ascending: true });
  if (rowError) throw new Error(`Import row history could not be loaded: ${rowError.message}`);
  const rowsByRun = new Map<string, EvidenceImportRowResult[]>();
  for (const row of rows ?? []) rowsByRun.set(row.import_run_id, [...(rowsByRun.get(row.import_run_id) ?? []), importRowFromRow(row)]);
  return runs.map((run): EvidenceImportHistoryEntry => ({
    ...importRunFromRow(run),
    rows: rowsByRun.get(run.id) ?? [],
  }));
}
