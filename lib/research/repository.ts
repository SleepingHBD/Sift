import { normalizeSource } from "@/lib/evidence/source";
import { createResearchClientRef, researchFromRow, type ResearchRow } from "@/lib/research/model";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Project, ResearchItem } from "@/lib/types";

export interface ResearchDraft {
  title: string;
  type: string;
  source: string;
  summary: string;
}

const researchSelect = "id,client_ref,project_id,title,url,publication,item_type,key_findings,notes,collection_name,metadata,created_at,updated_at";

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

export async function listCloudResearch(projects: Project[]) {
  const cloudProjectIds = projects.flatMap((project) => project.cloudId ? [project.cloudId] : []);
  if (!cloudProjectIds.length) return [];
  const client = requireClient();
  const { data, error } = await client
    .from("research_items")
    .select(researchSelect)
    .in("project_id", cloudProjectIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Research could not be loaded: ${error.message}`);
  const refs = projectRefMap(projects);
  return ((data ?? []) as unknown as ResearchRow[]).flatMap((row) => {
    const projectId = refs.get(row.project_id);
    return projectId ? [researchFromRow(row, projectId)] : [];
  });
}

export async function createCloudResearch(project: Project, input: ResearchDraft) {
  const client = requireClient();
  const cloudProjectId = requireCloudProject(project);
  const clientRef = createResearchClientRef();
  const source = normalizeSource(input.source);
  const { data, error } = await client
    .from("research_items")
    .insert({
      client_ref: clientRef,
      project_id: cloudProjectId,
      title: input.title.trim(),
      url: source.url,
      publication: source.label,
      item_type: input.type,
      key_findings: input.summary.trim() || null,
      collection_name: "Unsorted",
      metadata: { sift_origin: "research_form", source_label: source.label },
    })
    .select(researchSelect)
    .single();
  if (error || !data) throw new Error(`Research could not be saved: ${error?.message ?? "No record was returned."}`);
  return researchFromRow(data as unknown as ResearchRow, project.id);
}

export async function deleteCloudResearch(item: ResearchItem) {
  if (!item.cloudId) throw new Error("This research item has not been moved to the cloud yet.");
  const client = requireClient();
  const { data, error } = await client.from("research_items").delete().eq("id", item.cloudId).select("id");
  if (error) throw new Error(`Research could not be deleted: ${error.message}`);
  if (!data?.length) throw new Error("Research deletion was not permitted for the current account.");
}

export async function importLocalResearch(localItems: ResearchItem[], project: Project) {
  const client = requireClient();
  const cloudProjectId = requireCloudProject(project);
  for (const localItem of localItems) {
    const clientRef = localItem.clientRef || localItem.id;
    const source = normalizeSource(localItem.url || localItem.publication);
    const payload = {
      client_ref: clientRef,
      project_id: cloudProjectId,
      title: localItem.title.trim(),
      url: source.url,
      publication: source.url ? source.label : localItem.publication.trim() || null,
      item_type: localItem.type || "Article",
      key_findings: localItem.summary?.trim() || null,
      collection_name: localItem.collection?.trim() || "Unsorted",
      metadata: {
        sift_origin: "browser_import",
        source_label: source.label,
        tags: localItem.tags ?? [],
        legacy_saved_date: localItem.date || null,
      },
    };
    const { data: inserted, error: insertError } = await client
      .from("research_items")
      .upsert(payload, { onConflict: "project_id,client_ref", ignoreDuplicates: true })
      .select("id");
    if (insertError) throw new Error(`Could not import ${localItem.title}: ${insertError.message}`);
    if (!inserted?.length) {
      const { data: existing, error: lookupError } = await client
        .from("research_items")
        .select("id")
        .eq("project_id", cloudProjectId)
        .eq("client_ref", clientRef)
        .maybeSingle();
      if (lookupError || !existing?.id) throw new Error(`Could not verify the imported research item ${localItem.title}.`);
    }
  }
  return listCloudResearch([project]);
}
