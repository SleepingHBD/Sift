import type { EvidenceKind, EvidenceReference } from "@/lib/evidence/reference";
import { evidenceReviewMutation } from "@/lib/evidence/review";
import {
  emptyEvidenceOrganization,
  evidenceKey,
  normalizeEvidenceTags,
  type EvidenceBulkFailure,
  type EvidenceBulkResult,
  type EvidenceOrganizationSnapshot,
} from "@/lib/evidence/organization";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Project, EvidenceReviewStatus } from "@/lib/types";

type SiftSupabaseClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

const sourceTables = {
  mention: "mentions",
  research: "research_items",
  inspiration: "inspiration_items",
} as const;

const savedConflictColumns = "project_id,user_id,item_type,item_id,destination,destination_id";
const evidenceKinds = new Set<EvidenceKind>(["mention", "research", "inspiration"]);

export interface EvidenceReviewUpdate {
  reviewStatus: EvidenceReviewStatus;
  reviewedAt: string | null;
}

export interface EvidenceBulkReviewResult extends EvidenceBulkResult {
  updates: Record<string, EvidenceReviewUpdate>;
}

export interface EvidenceBulkTagResult extends EvidenceBulkResult {
  tags: string[];
  mode: "add" | "remove";
}

export interface EvidenceBulkProjectResult extends EvidenceBulkResult {
  projectId: string;
}

function requireClient() {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  return client;
}

async function currentUserId(client: SiftSupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.id) throw new Error("Your authenticated evidence session could not be verified.");
  return data.user.id;
}

function cloudProjectIds(projects: Project[]) {
  return [...new Set(projects.flatMap((project) => project.cloudId ? [project.cloudId] : []))];
}

function failure(item: EvidenceReference, message: string): EvidenceBulkFailure {
  return { key: evidenceKey(item), title: item.title, message };
}

function groupBySource(items: EvidenceReference[]) {
  const groups = new Map<string, EvidenceReference[]>();
  for (const item of items) {
    const key = `${item.projectId}:${item.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()];
}

function uniqueFailures(failures: EvidenceBulkFailure[]) {
  return [...new Map(failures.map((item) => [item.key, item])).values()];
}

function itemDatabaseKey(kind: EvidenceKind, itemId: string) {
  return `${kind}:${itemId}`;
}

export async function listEvidenceOrganization(projects: Project[]): Promise<EvidenceOrganizationSnapshot> {
  const projectIds = cloudProjectIds(projects);
  if (!projectIds.length) return emptyEvidenceOrganization;
  const client = requireClient();
  const userId = await currentUserId(client);
  const [tagsResult, itemTagsResult, projectLinksResult] = await Promise.all([
    client.from("tags").select("id,project_id,name").in("project_id", projectIds),
    client.from("item_tags").select("project_id,tag_id,item_type,item_id").in("project_id", projectIds),
    client.from("saved_items")
      .select("project_id,item_type,item_id,destination_id")
      .in("project_id", projectIds)
      .eq("user_id", userId)
      .eq("destination", "project"),
  ]);

  if (tagsResult.error) throw new Error(`Evidence tags could not be loaded: ${tagsResult.error.message}`);
  if (itemTagsResult.error) throw new Error(`Evidence tag links could not be loaded: ${itemTagsResult.error.message}`);
  if (projectLinksResult.error) throw new Error(`Evidence project links could not be loaded: ${projectLinksResult.error.message}`);

  const tagsById = new Map((tagsResult.data ?? []).map((tag) => [tag.id, tag.name]));
  const tagsByEvidence: Record<string, string[]> = {};
  for (const link of itemTagsResult.data ?? []) {
    if (!evidenceKinds.has(link.item_type as EvidenceKind)) continue;
    const name = tagsById.get(link.tag_id);
    if (!name) continue;
    const key = itemDatabaseKey(link.item_type as EvidenceKind, link.item_id);
    tagsByEvidence[key] = [...new Set([...(tagsByEvidence[key] ?? []), name])];
  }

  const availableProjects = new Set(projectIds);
  const projectIdsByEvidence: Record<string, string[]> = {};
  for (const link of projectLinksResult.data ?? []) {
    if (!evidenceKinds.has(link.item_type as EvidenceKind) || !link.destination_id || !availableProjects.has(link.destination_id)) continue;
    const key = itemDatabaseKey(link.item_type as EvidenceKind, link.item_id);
    projectIdsByEvidence[key] = [...new Set([...(projectIdsByEvidence[key] ?? []), link.destination_id])];
  }

  return { tagsByEvidence, projectIdsByEvidence };
}

export async function updateEvidenceReviewStatus(
  evidence: EvidenceReference,
  reviewStatus: EvidenceReviewStatus,
): Promise<EvidenceReviewUpdate> {
  if (!evidence.cloudId) throw new Error("This evidence record is not stored in the cloud yet.");
  const client = requireClient();
  const mutation = evidenceReviewMutation(reviewStatus);
  const { data, error } = await client
    .from(sourceTables[evidence.kind])
    .update(mutation)
    .eq("id", evidence.cloudId)
    .eq("project_id", evidence.projectId)
    .select("review_status,reviewed_at")
    .maybeSingle();

  if (error) throw new Error(`Review status could not be saved: ${error.message}`);
  if (!data) throw new Error("Review status was not saved because this account cannot update the source record.");
  return {
    reviewStatus: data.review_status as EvidenceReviewStatus,
    reviewedAt: data.reviewed_at,
  };
}

export async function updateEvidenceReviewStatuses(
  evidence: EvidenceReference[],
  reviewStatus: EvidenceReviewStatus,
): Promise<EvidenceBulkReviewResult> {
  const client = requireClient();
  const mutation = evidenceReviewMutation(reviewStatus);
  const succeeded = new Set<string>();
  const failures: EvidenceBulkFailure[] = [];
  const updates: Record<string, EvidenceReviewUpdate> = {};
  const cloudItems = evidence.filter((item) => {
    if (item.cloudId) return true;
    failures.push(failure(item, "This record is not stored in the cloud yet."));
    return false;
  });

  await Promise.all(groupBySource(cloudItems).map(async (items) => {
    const first = items[0];
    const ids = items.flatMap((item) => item.cloudId ? [item.cloudId] : []);
    const { data, error } = await client.from(sourceTables[first.kind])
      .update(mutation)
      .eq("project_id", first.projectId)
      .in("id", ids)
      .select("id,review_status,reviewed_at");

    if (error) {
      failures.push(...items.map((item) => failure(item, error.message)));
      return;
    }

    const returned = new Map(((data ?? []) as Array<{ id: string; review_status: string; reviewed_at: string | null }>)
      .map((row) => [row.id, row]));
    for (const item of items) {
      const row = item.cloudId ? returned.get(item.cloudId) : undefined;
      if (!row) {
        failures.push(failure(item, "The source record was not updated or is no longer accessible."));
        continue;
      }
      const key = evidenceKey(item);
      succeeded.add(key);
      updates[key] = { reviewStatus: row.review_status as EvidenceReviewStatus, reviewedAt: row.reviewed_at };
    }
  }));

  return { attempted: evidence.length, succeededKeys: [...succeeded], failures: uniqueFailures(failures), updates };
}

async function ensureTags(client: SiftSupabaseClient, projectId: string, requested: string[]) {
  const { data: existing, error: existingError } = await client.from("tags")
    .select("id,name")
    .eq("project_id", projectId);
  if (existingError) throw new Error(existingError.message);

  const byName = new Map((existing ?? []).map((tag) => [tag.name.toLocaleLowerCase(), tag]));
  const missing = requested.filter((name) => !byName.has(name.toLocaleLowerCase()));
  if (missing.length) {
    const { data: inserted, error: insertError } = await client.from("tags")
      .insert(missing.map((name) => ({ project_id: projectId, name })))
      .select("id,name");
    if (insertError) throw new Error(insertError.message);
    for (const tag of inserted ?? []) byName.set(tag.name.toLocaleLowerCase(), tag);
  }

  return requested.flatMap((name) => {
    const tag = byName.get(name.toLocaleLowerCase());
    return tag ? [{ id: tag.id, name: tag.name }] : [];
  });
}

export async function updateEvidenceTags(
  evidence: EvidenceReference[],
  rawTags: string | string[],
  mode: "add" | "remove",
): Promise<EvidenceBulkTagResult> {
  const tags = normalizeEvidenceTags(rawTags);
  if (!tags.length) throw new Error("Enter at least one tag.");
  const client = requireClient();
  const succeeded = new Set<string>();
  const failures: EvidenceBulkFailure[] = [];
  const cloudItems = evidence.filter((item) => {
    if (item.cloudId) return true;
    failures.push(failure(item, "This record is not stored in the cloud yet."));
    return false;
  });
  const projects = new Map<string, EvidenceReference[]>();
  for (const item of cloudItems) projects.set(item.projectId, [...(projects.get(item.projectId) ?? []), item]);

  await Promise.all([...projects.entries()].map(async ([projectId, projectItems]) => {
    let resolvedTags: Array<{ id: string; name: string }> = [];
    try {
      resolvedTags = mode === "add"
        ? await ensureTags(client, projectId, tags)
        : await (async () => {
          const { data, error } = await client.from("tags").select("id,name").eq("project_id", projectId);
          if (error) throw new Error(error.message);
          const requested = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
          return (data ?? []).filter((tag) => requested.has(tag.name.toLocaleLowerCase()));
        })();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tags could not be resolved.";
      failures.push(...projectItems.map((item) => failure(item, message)));
      return;
    }

    if (mode === "remove" && !resolvedTags.length) {
      projectItems.forEach((item) => succeeded.add(evidenceKey(item)));
      return;
    }

    const tagIds = resolvedTags.map((tag) => tag.id);
    await Promise.all(groupBySource(projectItems).map(async (items) => {
      const first = items[0];
      const itemIds = items.flatMap((item) => item.cloudId ? [item.cloudId] : []);
      if (mode === "add") {
        const rows = items.flatMap((item) => tagIds.map((tagId) => ({
          project_id: projectId,
          tag_id: tagId,
          item_type: item.kind,
          item_id: item.cloudId!,
        })));
        const { error } = await client.from("item_tags")
          .upsert(rows, { onConflict: "tag_id,item_type,item_id", ignoreDuplicates: true });
        if (error) {
          failures.push(...items.map((item) => failure(item, error.message)));
          return;
        }
      } else {
        const { error } = await client.from("item_tags").delete()
          .eq("project_id", projectId)
          .eq("item_type", first.kind)
          .in("item_id", itemIds)
          .in("tag_id", tagIds);
        if (error) {
          failures.push(...items.map((item) => failure(item, error.message)));
          return;
        }
      }

      const { data: remaining, error: verifyError } = await client.from("item_tags")
        .select("item_id,tag_id")
        .eq("project_id", projectId)
        .eq("item_type", first.kind)
        .in("item_id", itemIds)
        .in("tag_id", tagIds);
      if (verifyError) {
        failures.push(...items.map((item) => failure(item, verifyError.message)));
        return;
      }
      const present = new Set((remaining ?? []).map((link) => `${link.item_id}:${link.tag_id}`));
      for (const item of items) {
        const verified = mode === "add"
          ? tagIds.every((tagId) => present.has(`${item.cloudId}:${tagId}`))
          : tagIds.every((tagId) => !present.has(`${item.cloudId}:${tagId}`));
        if (verified) succeeded.add(evidenceKey(item));
        else failures.push(failure(item, "The tag change could not be verified after saving."));
      }
    }));
  }));

  return { attempted: evidence.length, succeededKeys: [...succeeded], failures: uniqueFailures(failures), tags, mode };
}

export async function assignEvidenceToProject(
  evidence: EvidenceReference[],
  targetProjectId: string,
): Promise<EvidenceBulkProjectResult> {
  if (!targetProjectId) throw new Error("Choose a destination project.");
  const client = requireClient();
  const userId = await currentUserId(client);
  const succeeded = new Set<string>();
  const failures: EvidenceBulkFailure[] = [];
  const linkable = evidence.filter((item) => {
    if (!item.cloudId) {
      failures.push(failure(item, "This record is not stored in the cloud yet."));
      return false;
    }
    if (item.associatedProjectIds.includes(targetProjectId)) {
      succeeded.add(evidenceKey(item));
      return false;
    }
    return true;
  });

  await Promise.all(groupBySource(linkable).map(async (items) => {
    const first = items[0];
    const rows = items.map((item) => ({
      project_id: item.projectId,
      item_type: item.kind,
      item_id: item.cloudId!,
      destination: "project",
      destination_id: targetProjectId,
      source_excerpt: (item.originalContent ?? item.excerpt ?? item.title).slice(0, 500),
      metadata: { destination_label: "Project evidence", sift_origin: "evidence_inbox" },
    }));
    const { error } = await client.from("saved_items")
      .upsert(rows, { onConflict: savedConflictColumns, ignoreDuplicates: true });
    if (error) {
      failures.push(...items.map((item) => failure(item, error.message)));
      return;
    }

    const itemIds = items.flatMap((item) => item.cloudId ? [item.cloudId] : []);
    const { data, error: verifyError } = await client.from("saved_items")
      .select("item_id")
      .eq("user_id", userId)
      .eq("project_id", first.projectId)
      .eq("item_type", first.kind)
      .eq("destination", "project")
      .eq("destination_id", targetProjectId)
      .in("item_id", itemIds);
    if (verifyError) {
      failures.push(...items.map((item) => failure(item, verifyError.message)));
      return;
    }
    const linked = new Set((data ?? []).map((row) => row.item_id));
    for (const item of items) {
      if (item.cloudId && linked.has(item.cloudId)) succeeded.add(evidenceKey(item));
      else failures.push(failure(item, "The project link could not be verified after saving."));
    }
  }));

  return { attempted: evidence.length, succeededKeys: [...succeeded], failures: uniqueFailures(failures), projectId: targetProjectId };
}
