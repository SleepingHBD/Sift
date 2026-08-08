import { normalizeSource } from "@/lib/evidence/source";
import { createInspirationClientRef, inspirationFromRow, type InspirationRow } from "@/lib/inspiration/model";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { InspirationItem, Project } from "@/lib/types";

export interface InspirationDraft {
  title: string;
  type: string;
  source: string;
  note: string;
}

const inspirationSelect = "id,client_ref,project_id,title,item_type,url,thumbnail_url,brand_name,notes,extracted_text,auto_tags,metadata,review_status,reviewed_at,created_at,updated_at";

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

function requireCloudProject(project: Project) {
  if (!project.cloudId) throw new Error("Choose a project that has been moved to the cloud.");
  return project.cloudId;
}

function projectRefMap(projects: Project[]) {
  return new Map(projects.flatMap((project) => project.cloudId ? [[project.cloudId, project.id] as const] : []));
}

export async function listCloudInspiration(projects: Project[]) {
  const cloudProjectIds = projects.flatMap((project) => project.cloudId ? [project.cloudId] : []);
  if (!cloudProjectIds.length) return [];
  const client = requireClient();
  const { data, error } = await client
    .from("inspiration_items")
    .select(inspirationSelect)
    .in("project_id", cloudProjectIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Inspiration could not be loaded: ${error.message}`);
  const refs = projectRefMap(projects);
  return ((data ?? []) as unknown as InspirationRow[]).flatMap((row) => {
    const projectId = refs.get(row.project_id);
    return projectId ? [inspirationFromRow(row, projectId)] : [];
  });
}

export async function createCloudInspiration(project: Project, input: InspirationDraft) {
  const client = requireClient();
  const cloudProjectId = requireCloudProject(project);
  const clientRef = createInspirationClientRef();
  const source = normalizeSource(input.source);
  const { data, error } = await client
    .from("inspiration_items")
    .insert({
      client_ref: clientRef,
      project_id: cloudProjectId,
      title: input.title.trim(),
      item_type: input.type,
      url: source.url,
      brand_name: project.brand.trim() || null,
      notes: input.note.trim() || null,
      metadata: {
        sift_origin: "inspiration_form",
        capture_method: source.url ? "url" : "manual",
        source_label: source.label,
      },
    })
    .select(inspirationSelect)
    .single();
  if (error || !data) throw new Error(`Inspiration could not be saved: ${error?.message ?? "No record was returned."}`);
  return inspirationFromRow(data as unknown as InspirationRow, project.id);
}

export async function deleteCloudInspiration(item: InspirationItem) {
  if (!item.cloudId) throw new Error("This inspiration item has not been moved to the cloud yet.");
  const client = requireClient();
  const { data, error } = await client.from("inspiration_items").delete().eq("id", item.cloudId).select("id");
  if (error) throw new Error(`Inspiration could not be deleted: ${error.message}`);
  if (!data?.length) throw new Error("Inspiration deletion was not permitted for the current account.");
}

export async function importLocalInspiration(localItems: InspirationItem[], project: Project) {
  const client = requireClient();
  const cloudProjectId = requireCloudProject(project);
  for (const localItem of localItems) {
    const clientRef = localItem.clientRef || localItem.id;
    const source = normalizeSource(localItem.url || localItem.source);
    const payload = {
      client_ref: clientRef,
      project_id: cloudProjectId,
      title: localItem.title.trim(),
      item_type: localItem.type || "Personal idea",
      url: source.url,
      brand_name: localItem.brand?.trim() || project.brand.trim() || null,
      notes: localItem.note?.trim() || null,
      auto_tags: localItem.tags ?? [],
      metadata: {
        sift_origin: "browser_import",
        capture_method: "import",
        source_label: source.url ? source.label : localItem.source?.trim() || null,
        palette: localItem.palette || null,
        legacy_saved_date: localItem.savedAt || null,
      },
    };
    const { data: inserted, error: insertError } = await client
      .from("inspiration_items")
      .upsert(payload, { onConflict: "project_id,client_ref", ignoreDuplicates: true })
      .select("id");
    if (insertError) throw new Error(`Could not import ${localItem.title}: ${insertError.message}`);
    if (!inserted?.length) {
      const { data: existing, error: lookupError } = await client
        .from("inspiration_items")
        .select("id")
        .eq("project_id", cloudProjectId)
        .eq("client_ref", clientRef)
        .maybeSingle();
      if (lookupError || !existing?.id) throw new Error(`Could not verify the imported inspiration item ${localItem.title}.`);
    }
  }
  return listCloudInspiration([project]);
}
