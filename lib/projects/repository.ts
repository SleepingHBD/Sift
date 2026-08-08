import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  createProjectClientRef,
  primaryBrand,
  projectFromRow,
  type ProjectRow,
  type ProjectStatus,
  type RelatedNameRow,
} from "@/lib/projects/model";
import type { Project } from "@/lib/types";

type SiftSupabaseClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

export interface ProjectDraft {
  name: string;
  brand: string;
  market: string;
  description: string;
  competitors: string[];
}

const internalRadarProjectRef = "personal-radar";
const projectSelect = `
  id,
  client_ref,
  name,
  description,
  market,
  focus,
  status,
  created_at,
  updated_at,
  brands (id, name, metadata, created_at),
  competitors (id, name, metadata, created_at),
  mentions (count),
  research_items (count),
  insights (count)
`;

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

export async function listCloudProjects() {
  const client = requireClient();
  const { data, error } = await client
    .from("projects")
    .select(projectSelect)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Projects could not be loaded: ${error.message}`);
  return ((data ?? []) as unknown as ProjectRow[])
    .filter((row) => row.client_ref !== internalRadarProjectRef)
    .map(projectFromRow);
}

export async function createCloudProject(input: ProjectDraft) {
  const client = requireClient();
  const clientRef = createProjectClientRef();
  const { data, error } = await client
    .from("projects")
    .insert({
      client_ref: clientRef,
      name: input.name.trim(),
      description: input.description.trim() || null,
      focus: input.description.trim() || null,
      market: input.market.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`Project could not be created: ${error?.message ?? "No record was returned."}`);

  try {
    await syncProjectContext(client, String(data.id), input);
  } catch (contextError) {
    await client.from("projects").delete().eq("id", data.id);
    throw contextError;
  }

  return getCloudProject(String(data.id));
}

export async function updateCloudProject(project: Project, input: ProjectDraft) {
  const client = requireClient();
  if (!project.cloudId) throw new Error("This project has not been connected to the cloud yet.");
  const { data, error } = await client
    .from("projects")
    .update({
      name: input.name.trim(),
      description: input.description.trim() || null,
      focus: input.description.trim() || null,
      market: input.market.trim() || null,
    })
    .eq("id", project.cloudId)
    .select("id");
  if (error) throw new Error(`Project could not be updated: ${error.message}`);
  if (!data?.length) throw new Error("Project update was not permitted for the current account.");
  await syncProjectContext(client, project.cloudId, input);
  return getCloudProject(project.cloudId);
}

export async function setCloudProjectArchived(project: Project, archived: boolean) {
  const client = requireClient();
  if (!project.cloudId) throw new Error("Import this project before changing its status.");
  const status: ProjectStatus = archived ? "archived" : "active";
  const { data, error } = await client
    .from("projects")
    .update({ status })
    .eq("id", project.cloudId)
    .select("id");
  if (error) throw new Error(`Project status could not be changed: ${error.message}`);
  if (!data?.length) throw new Error("Project status change was not permitted for the current account.");
  return { ...project, status, updatedAt: new Date().toISOString() };
}

export async function deleteCloudProject(project: Project) {
  const client = requireClient();
  if (!project.cloudId) throw new Error("This project does not have a cloud record to delete.");
  const { data, error } = await client
    .from("projects")
    .delete()
    .eq("id", project.cloudId)
    .select("id");
  if (error) throw new Error(`Project could not be deleted: ${error.message}`);
  if (!data?.length) throw new Error("Project deletion was not permitted for the current account.");
}

export async function importLocalProjects(localProjects: Project[]) {
  const client = requireClient();
  for (const localProject of localProjects) {
    const clientRef = localProject.clientRef || localProject.id;
    const { data: inserted, error: insertError } = await client
      .from("projects")
      .upsert({
        client_ref: clientRef,
        name: localProject.name.trim(),
        description: (localProject.description || localProject.focus || "").trim() || null,
        focus: (localProject.focus || localProject.description || "").trim() || null,
        market: localProject.market.trim() || null,
        status: localProject.status ?? "active",
      }, { onConflict: "owner_id,client_ref", ignoreDuplicates: true })
      .select("id");
    if (insertError) throw new Error(`Could not import ${localProject.name}: ${insertError.message}`);

    let cloudId = inserted?.[0]?.id ? String(inserted[0].id) : "";
    if (!cloudId) {
      const { data: existing, error: lookupError } = await client
        .from("projects")
        .select("id")
        .eq("client_ref", clientRef)
        .maybeSingle();
      if (lookupError || !existing?.id) throw new Error(`Could not verify the imported project ${localProject.name}.`);
      cloudId = String(existing.id);
    }

    await ensureImportedContext(client, cloudId, localProject);
  }
  return listCloudProjects();
}

async function getCloudProject(cloudId: string) {
  const client = requireClient();
  const { data, error } = await client.from("projects").select(projectSelect).eq("id", cloudId).single();
  if (error || !data) throw new Error(`Project could not be reloaded: ${error?.message ?? "No record was returned."}`);
  return projectFromRow(data as unknown as ProjectRow);
}

async function syncProjectContext(client: SiftSupabaseClient, projectId: string, input: ProjectDraft) {
  const { data: brands, error: brandsError } = await client
    .from("brands")
    .select("id,name,metadata,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (brandsError) throw new Error(`Brand context could not be loaded: ${brandsError.message}`);
  const primary = primaryBrand(brands as RelatedNameRow[]);
  const brandName = input.brand.trim();
  if (brandName && primary) {
    const { error } = await client.from("brands").update({ name: brandName, market: input.market.trim() || null, metadata: { ...(primary.metadata ?? {}), sift_role: "primary", sift_origin: "project_form" } }).eq("id", primary.id);
    if (error) throw new Error(`Brand context could not be updated: ${error.message}`);
  } else if (brandName) {
    const { error } = await client.from("brands").insert({ project_id: projectId, name: brandName, market: input.market.trim() || null, metadata: { sift_role: "primary", sift_origin: "project_form" } });
    if (error) throw new Error(`Brand context could not be saved: ${error.message}`);
  } else if (primary?.metadata?.sift_origin === "project_form") {
    const { error } = await client.from("brands").delete().eq("id", primary.id);
    if (error) throw new Error(`Brand context could not be removed: ${error.message}`);
  }

  const { data: competitors, error: competitorsError } = await client
    .from("competitors")
    .select("id,name,metadata")
    .eq("project_id", projectId);
  if (competitorsError) throw new Error(`Competitors could not be loaded: ${competitorsError.message}`);
  const existing = (competitors ?? []) as RelatedNameRow[];
  const desired = [...new Map(input.competitors.map((name) => name.trim()).filter(Boolean).map((name) => [name.toLocaleLowerCase(), name])).entries()];
  const existingByName = new Map(existing.map((row) => [row.name.toLocaleLowerCase(), row]));
  const missing = desired.filter(([normalized]) => !existingByName.has(normalized));
  if (missing.length) {
    const { error } = await client.from("competitors").insert(missing.map(([, name]) => ({ project_id: projectId, name, metadata: { sift_origin: "project_form" } })));
    if (error) throw new Error(`Competitors could not be saved: ${error.message}`);
  }
  const desiredNames = new Set(desired.map(([normalized]) => normalized));
  const removable = existing.filter((row) => row.metadata?.sift_origin === "project_form" && !desiredNames.has(row.name.toLocaleLowerCase()));
  if (removable.length) {
    const { error } = await client.from("competitors").delete().in("id", removable.map((row) => row.id));
    if (error) throw new Error(`Competitors could not be removed: ${error.message}`);
  }
}

async function ensureImportedContext(client: SiftSupabaseClient, projectId: string, project: Project) {
  const brandName = project.brand.trim();
  if (brandName) {
    const { data: brands, error } = await client.from("brands").select("id,name").eq("project_id", projectId);
    if (error) throw new Error(`Could not verify the imported brand: ${error.message}`);
    if (!(brands ?? []).some((brand) => brand.name.toLocaleLowerCase() === brandName.toLocaleLowerCase())) {
      const { error: brandError } = await client.from("brands").insert({ project_id: projectId, name: brandName, market: project.market || null, metadata: { sift_role: "primary", sift_origin: "local_import" } });
      if (brandError) throw new Error(`Could not import the brand for ${project.name}: ${brandError.message}`);
    }
  }

  const desired = [...new Map((project.competitors ?? []).map((name) => name.trim()).filter(Boolean).map((name) => [name.toLocaleLowerCase(), name])).entries()];
  if (!desired.length) return;
  const { data: competitors, error } = await client.from("competitors").select("name").eq("project_id", projectId);
  if (error) throw new Error(`Could not verify imported competitors: ${error.message}`);
  const existingNames = new Set((competitors ?? []).map((competitor) => competitor.name.toLocaleLowerCase()));
  const missing = desired.filter(([normalized]) => !existingNames.has(normalized));
  if (!missing.length) return;
  const { error: insertError } = await client.from("competitors").insert(missing.map(([, name]) => ({ project_id: projectId, name, metadata: { sift_origin: "local_import" } })));
  if (insertError) throw new Error(`Could not import competitors for ${project.name}: ${insertError.message}`);
}
