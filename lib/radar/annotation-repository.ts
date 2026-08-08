import { evidenceDestinationToDatabase, evidenceLinkFromRow, type MentionNoteRow, type SavedMentionRow } from "@/lib/radar/annotation-model";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { InspirationItem, Project, ResearchItem } from "@/lib/types";
import type { RadarEvidenceLink, RadarMention } from "@/lib/radar/types";

type SiftSupabaseClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

const noteSelect = "id,project_id,mention_id,content,created_at,updated_at";
const savedSelect = "id,project_id,item_id,destination,destination_id,note,source_excerpt,metadata,created_at";
const savedConflictColumns = "project_id,user_id,item_type,item_id,destination,destination_id";

export interface RadarAnnotationSnapshot {
  savedIds: string[];
  importantIds: string[];
  notes: Record<string, string>;
  evidenceLinks: RadarEvidenceLink[];
}

export interface LocalRadarAnnotationPayload {
  savedIds: string[];
  importantIds: string[];
  notes: Record<string, string>;
  evidenceLinks: RadarEvidenceLink[];
}

export interface RadarAnnotationContext {
  projects: Project[];
  researchItems: ResearchItem[];
  inspirationItems: InspirationItem[];
}

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

function requireCloudMention(mention: RadarMention) {
  if (!mention.cloudId || !mention.cloudProjectId) {
    throw new Error("This conversation has not been moved to the cloud yet.");
  }
  return { mentionId: mention.cloudId, projectId: mention.cloudProjectId };
}

function allMentions(mentionsByMonitor: Record<string, RadarMention[]>) {
  return Object.values(mentionsByMonitor).flat();
}

async function currentUserId(client: SiftSupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.id) throw new Error("Your authenticated Radar session could not be verified.");
  return data.user.id;
}

export async function listCloudRadarAnnotations(mentionsByMonitor: Record<string, RadarMention[]>): Promise<RadarAnnotationSnapshot> {
  const mentions = allMentions(mentionsByMonitor);
  const cloudMentionIds = mentions.flatMap((mention) => mention.cloudId ? [mention.cloudId] : []);
  const projectIds = [...new Set(mentions.flatMap((mention) => mention.cloudProjectId ? [mention.cloudProjectId] : []))];
  const importantIds = mentions.filter((mention) => mention.isImportant).map((mention) => mention.id);
  if (!cloudMentionIds.length || !projectIds.length) return { savedIds: [], importantIds, notes: {}, evidenceLinks: [] };

  const client = requireClient();
  const userId = await currentUserId(client);
  const [noteResult, savedResult] = await Promise.all([
    client.from("mention_notes").select(noteSelect).in("project_id", projectIds).eq("user_id", userId)
      .order("updated_at", { ascending: false }).order("id", { ascending: false }),
    client.from("saved_items").select(savedSelect).in("project_id", projectIds).eq("user_id", userId).eq("item_type", "mention")
      .order("created_at", { ascending: false }).order("id", { ascending: false }),
  ]);
  if (noteResult.error) throw new Error(`Radar notes could not be loaded: ${noteResult.error.message}`);
  if (savedResult.error) throw new Error(`Saved Radar evidence could not be loaded: ${savedResult.error.message}`);

  const mentionByCloudId = new Map(mentions.flatMap((mention) => mention.cloudId ? [[mention.cloudId, mention] as const] : []));
  const notes: Record<string, string> = {};
  for (const row of (noteResult.data ?? []) as unknown as MentionNoteRow[]) {
    const mention = mentionByCloudId.get(row.mention_id);
    if (mention) notes[mention.id] = row.content;
  }

  const savedIds: string[] = [];
  const evidenceLinks: RadarEvidenceLink[] = [];
  for (const row of (savedResult.data ?? []) as unknown as SavedMentionRow[]) {
    const mention = mentionByCloudId.get(row.item_id);
    if (!mention) continue;
    if (row.destination === "saved") {
      savedIds.push(mention.id);
      continue;
    }
    const link = evidenceLinkFromRow(row, mention);
    if (link) evidenceLinks.push(link);
  }
  return { savedIds: [...new Set(savedIds)], importantIds: [...new Set(importantIds)], notes, evidenceLinks };
}

export async function setCloudMentionSaved(mention: RadarMention, saved: boolean) {
  const { mentionId, projectId } = requireCloudMention(mention);
  const client = requireClient();
  if (!saved) {
    const { error } = await client.from("saved_items").delete()
      .eq("project_id", projectId).eq("item_type", "mention").eq("item_id", mentionId)
      .eq("destination", "saved").is("destination_id", null);
    if (error) throw new Error(`Saved mention could not be removed: ${error.message}`);
    return;
  }
  const { error } = await client.from("saved_items").upsert({
    project_id: projectId,
    item_type: "mention",
    item_id: mentionId,
    destination: "saved",
    destination_id: null,
    source_excerpt: mention.content.slice(0, 500),
    metadata: { destination_label: "Saved evidence", sift_origin: "radar" },
  }, { onConflict: savedConflictColumns }).select("id");
  if (error) throw new Error(`Mention could not be saved: ${error.message}`);
}

export async function setCloudMentionImportant(mention: RadarMention, important: boolean) {
  const { mentionId, projectId } = requireCloudMention(mention);
  const client = requireClient();
  const { data, error } = await client.from("mentions").update({ is_important: important })
    .eq("id", mentionId).eq("project_id", projectId).select("id");
  if (error) throw new Error(`Importance could not be updated: ${error.message}`);
  if (!data?.length) throw new Error("Importance could not be updated for this account.");
}

export async function saveCloudMentionNote(mention: RadarMention, content: string) {
  const { mentionId, projectId } = requireCloudMention(mention);
  const client = requireClient();
  const cleanContent = content.trim();
  if (!cleanContent) {
    const { error } = await client.from("mention_notes").delete().eq("project_id", projectId).eq("mention_id", mentionId);
    if (error) throw new Error(`The note could not be removed: ${error.message}`);
    return;
  }
  const { error } = await client.from("mention_notes").upsert({
    project_id: projectId,
    mention_id: mentionId,
    content: cleanContent,
  }, { onConflict: "mention_id,user_id" }).select("id");
  if (error) throw new Error(`The note could not be saved: ${error.message}`);
}

function resolveDestination(link: RadarEvidenceLink, mention: RadarMention, context: RadarAnnotationContext) {
  if (link.destinationCloudId) return link.destinationCloudId;
  if (link.destination === "project") {
    return context.projects.find((item) => item.id === link.destinationId)?.cloudId ?? mention.cloudProjectId ?? null;
  }
  if (link.destination === "research") {
    return context.researchItems.find((item) => item.id === link.destinationId)?.cloudId ?? null;
  }
  if (link.destination === "inspiration") {
    return context.inspirationItems.find((item) => item.id === link.destinationId)?.cloudId ?? null;
  }
  return null;
}

export async function createCloudEvidenceLink(mention: RadarMention, link: RadarEvidenceLink, context: RadarAnnotationContext) {
  const { mentionId, projectId } = requireCloudMention(mention);
  const client = requireClient();
  const destinationId = resolveDestination(link, mention, context);
  const databaseDestination = evidenceDestinationToDatabase(link.destination);
  const { data, error } = await client.from("saved_items").upsert({
    project_id: projectId,
    item_type: "mention",
    item_id: mentionId,
    destination: databaseDestination,
    destination_id: destinationId,
    note: link.note?.trim() || null,
    source_excerpt: mention.content.slice(0, 500),
    metadata: {
      destination_label: link.destinationLabel,
      destination_client_ref: link.destinationId ?? null,
      sift_origin: "radar",
    },
  }, { onConflict: savedConflictColumns }).select(savedSelect).single();
  if (error || !data) throw new Error(`Evidence could not be linked: ${error?.message ?? "No record was returned."}`);
  return evidenceLinkFromRow(data as unknown as SavedMentionRow, mention);
}

export async function deleteCloudEvidenceLink(link: RadarEvidenceLink) {
  if (!link.cloudId) throw new Error("This evidence relationship has not been moved to the cloud yet.");
  const client = requireClient();
  const { data, error } = await client.from("saved_items").delete().eq("id", link.cloudId).select("id");
  if (error) throw new Error(`Evidence relationship could not be removed: ${error.message}`);
  if (!data?.length) throw new Error("Evidence relationship deletion was not permitted.");
}

export async function importLocalRadarAnnotations(
  payload: LocalRadarAnnotationPayload,
  mentionsByMonitor: Record<string, RadarMention[]>,
  context: RadarAnnotationContext,
) {
  const mentions = allMentions(mentionsByMonitor);
  const mentionById = new Map(mentions.map((mention) => [mention.id, mention]));
  for (const mentionId of payload.savedIds) {
    const mention = mentionById.get(mentionId);
    if (mention) await setCloudMentionSaved(mention, true);
  }
  for (const mentionId of payload.importantIds) {
    const mention = mentionById.get(mentionId);
    if (mention) await setCloudMentionImportant(mention, true);
  }
  for (const [mentionId, note] of Object.entries(payload.notes)) {
    const mention = mentionById.get(mentionId);
    if (mention) await saveCloudMentionNote(mention, note);
  }
  for (const link of payload.evidenceLinks) {
    const mention = mentionById.get(link.mentionId);
    if (mention) await createCloudEvidenceLink(mention, link, context);
  }
  return listCloudRadarAnnotations(mentionsByMonitor);
}
