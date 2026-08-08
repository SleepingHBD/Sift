import type {
  EvidenceInboxGroup,
  EvidenceInboxKindFilter,
  EvidenceInboxSort,
  EvidenceInboxView,
} from "./inbox.ts";
import { createBrowserSupabaseClient } from "../supabase/client.ts";
import type { Database } from "../supabase/database.types.ts";

type SavedViewRow = Database["public"]["Tables"]["evidence_saved_views"]["Row"];
type SavedViewRecord = Pick<SavedViewRow,
  | "id"
  | "name"
  | "search_query"
  | "project_id"
  | "kind_filter"
  | "view_filter"
  | "sort_order"
  | "group_by"
  | "created_at"
  | "updated_at"
>;
type SiftSupabaseClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

const kinds = new Set<EvidenceInboxKindFilter>(["all", "mention", "research", "inspiration"]);
const views = new Set<EvidenceInboxView>(["all", "needs-review", "recent"]);
const sorts = new Set<EvidenceInboxSort>(["newest", "oldest", "recently-reviewed", "source", "project"]);
const groups = new Set<EvidenceInboxGroup>(["none", "project", "kind", "status"]);

export interface EvidenceSavedViewDefinition {
  query: string;
  projectId: string | null;
  kind: EvidenceInboxKindFilter;
  view: EvidenceInboxView;
  sort: EvidenceInboxSort;
  group: EvidenceInboxGroup;
}

export interface EvidenceSavedView extends EvidenceSavedViewDefinition {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

async function verifyUser(client: SiftSupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.id) throw new Error("Your authenticated saved-view session could not be verified.");
}

function savedViewError(error: { code?: string; message: string }, action: string) {
  if (error.code === "23505") return new Error("A saved view with this name already exists.");
  if (error.code === "23503") return new Error("The project in this saved view is no longer available.");
  if (error.code === "42501") return new Error("This account cannot access that saved view or project.");
  return new Error(`${action}: ${error.message}`);
}

export function normalizeEvidenceSavedViewName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Give this saved view a name.");
  if (name.length > 80) throw new Error("Saved view names can contain up to 80 characters.");
  return name;
}

export function normalizeEvidenceSavedViewDefinition(
  definition: EvidenceSavedViewDefinition,
): EvidenceSavedViewDefinition {
  const query = definition.query.trim();
  if (query.length > 500) throw new Error("Saved searches can contain up to 500 characters.");
  if (!kinds.has(definition.kind)) throw new Error("The saved evidence type is not supported.");
  if (!views.has(definition.view)) throw new Error("The saved review view is not supported.");
  if (!sorts.has(definition.sort)) throw new Error("The saved sort order is not supported.");
  if (!groups.has(definition.group)) throw new Error("The saved grouping is not supported.");
  return {
    query,
    projectId: definition.projectId?.trim() || null,
    kind: definition.kind,
    view: definition.view,
    sort: definition.sort,
    group: definition.group,
  };
}

export function evidenceSavedViewFromRow(row: SavedViewRecord): EvidenceSavedView {
  return {
    id: row.id,
    name: row.name,
    query: row.search_query,
    projectId: row.project_id,
    kind: row.kind_filter as EvidenceInboxKindFilter,
    view: row.view_filter as EvidenceInboxView,
    sort: row.sort_order as EvidenceInboxSort,
    group: row.group_by as EvidenceInboxGroup,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function evidenceSavedViewMatches(
  savedView: EvidenceSavedViewDefinition,
  current: EvidenceSavedViewDefinition,
) {
  const left = normalizeEvidenceSavedViewDefinition(savedView);
  const right = normalizeEvidenceSavedViewDefinition(current);
  return left.query === right.query
    && left.projectId === right.projectId
    && left.kind === right.kind
    && left.view === right.view
    && left.sort === right.sort
    && left.group === right.group;
}

function savedViewMutation(name: string, definition: EvidenceSavedViewDefinition) {
  const normalized = normalizeEvidenceSavedViewDefinition(definition);
  return {
    name: normalizeEvidenceSavedViewName(name),
    search_query: normalized.query,
    project_id: normalized.projectId,
    kind_filter: normalized.kind,
    view_filter: normalized.view,
    sort_order: normalized.sort,
    group_by: normalized.group,
  };
}

export async function listEvidenceSavedViews(): Promise<EvidenceSavedView[]> {
  const client = requireClient();
  await verifyUser(client);
  const { data, error } = await client
    .from("evidence_saved_views")
    .select("id,name,search_query,project_id,kind_filter,view_filter,sort_order,group_by,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw savedViewError(error, "Saved views could not be loaded");
  return (data ?? []).map(evidenceSavedViewFromRow);
}

export async function createEvidenceSavedView(
  name: string,
  definition: EvidenceSavedViewDefinition,
): Promise<EvidenceSavedView> {
  const client = requireClient();
  await verifyUser(client);
  const { data, error } = await client
    .from("evidence_saved_views")
    .insert(savedViewMutation(name, definition))
    .select("id,name,search_query,project_id,kind_filter,view_filter,sort_order,group_by,created_at,updated_at")
    .single();
  if (error) throw savedViewError(error, "Saved view could not be created");
  return evidenceSavedViewFromRow(data);
}

export async function updateEvidenceSavedView(
  id: string,
  name: string,
  definition: EvidenceSavedViewDefinition,
): Promise<EvidenceSavedView> {
  const client = requireClient();
  await verifyUser(client);
  const { data, error } = await client
    .from("evidence_saved_views")
    .update(savedViewMutation(name, definition))
    .eq("id", id)
    .select("id,name,search_query,project_id,kind_filter,view_filter,sort_order,group_by,created_at,updated_at")
    .maybeSingle();
  if (error) throw savedViewError(error, "Saved view could not be updated");
  if (!data) throw new Error("The saved view was not updated because it is unavailable to this account.");
  return evidenceSavedViewFromRow(data);
}

export async function deleteEvidenceSavedView(id: string) {
  const client = requireClient();
  await verifyUser(client);
  const { data, error } = await client
    .from("evidence_saved_views")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw savedViewError(error, "Saved view could not be deleted");
  if (!data) throw new Error("The saved view was not deleted because it is unavailable to this account.");
  return data.id;
}
