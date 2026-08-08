import { normalizeSource } from "@/lib/evidence/source";
import { normalizeCaptureUrl } from "@/lib/evidence/capture";
import type { EvidenceCaptureMethod } from "@/lib/evidence/reference";
import type { EvidenceUrlMetadata } from "@/lib/evidence/url-extraction";
import {
  createEvidenceStoragePath,
  EVIDENCE_ASSET_BUCKET,
  validateEvidenceFile,
} from "@/lib/evidence/file-capture";
import { socialPlatforms, validateSocialScreenshot, type SocialPlatform } from "@/lib/evidence/social-capture";
import { createResearchClientRef, researchFromRow, type ResearchRow } from "@/lib/research/model";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { EvidenceAsset, Project, ResearchItem } from "@/lib/types";

type ResearchInsert = Database["public"]["Tables"]["research_items"]["Insert"];
type ResearchAssetPayload = Omit<ResearchInsert, "client_ref" | "project_id">;

export interface ResearchDraft {
  title: string;
  type: string;
  source: string;
  summary: string;
  sourceText?: string;
  captureMethod?: EvidenceCaptureMethod;
  captureOrigin?: "research_form" | "global_capture";
  urlMetadata?: EvidenceUrlMetadata;
}

export interface ResearchFileDraft {
  title: string;
  summary: string;
  file: File;
  captureOrigin?: "research_form" | "global_capture";
}

export interface ResearchSocialDraft {
  title: string;
  url: string;
  platform: SocialPlatform;
  author?: string;
  caption?: string;
  selectedComments?: string;
  observedAt?: string;
  summary: string;
  screenshot?: File;
  urlMetadata?: EvidenceUrlMetadata;
}

const researchSelect = "id,client_ref,project_id,title,url,author,publication,published_at,item_type,key_findings,notes,ai_summary,collection_name,metadata,created_at,updated_at";
const assetSelect = "id,project_id,research_item_id,bucket_id,storage_path,original_filename,mime_type,byte_size,asset_kind,processing_status,created_at";
const researchSelectWithAssets = `${researchSelect},evidence_assets(${assetSelect})`;

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
    .select(researchSelectWithAssets)
    .in("project_id", cloudProjectIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Research could not be loaded: ${error.message}`);
  const refs = projectRefMap(projects);
  return ((data ?? []) as unknown as ResearchRow[]).flatMap((row) => {
    const projectId = refs.get(row.project_id);
    return projectId ? [researchFromRow(row, projectId)] : [];
  });
}

async function removeStorageObject(path: string) {
  const client = requireClient();
  const { error } = await client.storage.from(EVIDENCE_ASSET_BUCKET).remove([path]);
  return error?.message ?? null;
}

async function createCloudResearchWithAsset(
  project: Project,
  userId: string,
  file: File,
  payload: ResearchAssetPayload,
  options: { screenshotOnly?: boolean } = {},
) {
  const validation = options.screenshotOnly ? validateSocialScreenshot(file) : validateEvidenceFile(file);
  if (!validation.ok) throw new Error(validation.error);
  const client = requireClient();
  const cloudProjectId = requireCloudProject(project);
  const clientRef = createResearchClientRef();
  const storagePath = createEvidenceStoragePath({
    userId,
    projectId: cloudProjectId,
    researchClientRef: clientRef,
    filename: file.name,
    mimeType: validation.mimeType,
  });

  const { error: uploadError } = await client.storage
    .from(EVIDENCE_ASSET_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: validation.mimeType,
      upsert: false,
    });
  if (uploadError) throw new Error(`File could not be uploaded: ${uploadError.message}`);

  const { data: research, error: researchError } = await client
    .from("research_items")
    .insert({
      client_ref: clientRef,
      project_id: cloudProjectId,
      ...payload,
    })
    .select(researchSelect)
    .single();

  if (researchError || !research) {
    const cleanupError = await removeStorageObject(storagePath);
    throw new Error(`File details could not be saved: ${researchError?.message ?? "No record was returned."}${cleanupError ? ` Upload cleanup also failed: ${cleanupError}` : ""}`);
  }

  const { data: asset, error: assetError } = await client
    .from("evidence_assets")
    .insert({
      project_id: cloudProjectId,
      research_item_id: research.id,
      bucket_id: EVIDENCE_ASSET_BUCKET,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: validation.mimeType,
      byte_size: file.size,
      asset_kind: validation.kind,
      processing_status: "ready",
    })
    .select(assetSelect)
    .single();

  if (assetError || !asset) {
    const { error: researchCleanupError } = await client.from("research_items").delete().eq("id", research.id);
    const cleanupError = await removeStorageObject(storagePath);
    const rollbackErrors = [researchCleanupError?.message, cleanupError].filter(Boolean);
    throw new Error(`File attachment could not be saved: ${assetError?.message ?? "No record was returned."}${rollbackErrors.length ? ` Rollback also needs attention: ${rollbackErrors.join("; ")}` : ""}`);
  }

  return researchFromRow({
    ...research,
    evidence_assets: [asset],
  } as unknown as ResearchRow, project.id);
}

export async function createCloudFileResearch(
  project: Project,
  userId: string,
  input: ResearchFileDraft,
) {
  const validation = validateEvidenceFile(input.file);
  if (!validation.ok) throw new Error(validation.error);
  return createCloudResearchWithAsset(project, userId, input.file, {
      title: input.title.trim() || input.file.name,
      publication: "Private upload",
      item_type: validation.kind === "image" ? "Screenshot" : "Document",
      key_findings: input.summary.trim() || null,
      collection_name: "Unsorted",
      metadata: {
        sift_origin: input.captureOrigin ?? "global_capture",
        capture_method: "upload",
        source_label: "Private upload",
        processing_status: "unprocessed",
      },
  });
}

function socialResearchMetadata(input: ResearchSocialDraft) {
  const urlMetadata = input.urlMetadata;
  return {
    sift_origin: "social_capture",
    capture_method: "strategist",
    source_label: input.platform,
    social_platform: input.platform,
    social_author: input.author?.trim() || null,
    observed_at: input.observedAt || null,
    source_text: input.caption?.trim() || null,
    selected_comments: input.selectedComments?.trim() || null,
    extraction_status: urlMetadata ? "complete" : "manual_capture",
    capture_limitation: "Strategist-captured evidence; not collected by a live connector.",
    processing_status: "unprocessed",
    ...(urlMetadata ? {
      original_url: urlMetadata.originalUrl,
      final_url: urlMetadata.finalUrl,
      canonical_url: urlMetadata.canonicalUrl,
      description: urlMetadata.description ?? null,
      preview_image: urlMetadata.previewImage ?? null,
      extracted_at: urlMetadata.extractedAt,
    } : {}),
  };
}

export async function createCloudSocialResearch(
  project: Project,
  userId: string,
  input: ResearchSocialDraft,
) {
  const url = normalizeCaptureUrl(input.url);
  if (!url) throw new Error("Enter a valid public social post address.");
  if (!socialPlatforms.includes(input.platform)) throw new Error("Choose a valid social platform.");
  const payload = {
    title: input.title.trim() || `${input.platform} post`,
    url,
    author: input.author?.trim() || null,
    publication: input.platform,
    item_type: "Social post",
    key_findings: input.summary.trim() || null,
    collection_name: "Unsorted",
    metadata: socialResearchMetadata(input),
  };
  if (input.screenshot) {
    return createCloudResearchWithAsset(project, userId, input.screenshot, payload, { screenshotOnly: true });
  }

  const client = requireClient();
  const cloudProjectId = requireCloudProject(project);
  const { data, error } = await client
    .from("research_items")
    .insert({
      client_ref: createResearchClientRef(),
      project_id: cloudProjectId,
      ...payload,
    })
    .select(researchSelect)
    .single();
  if (error || !data) throw new Error(`Social evidence could not be saved: ${error?.message ?? "No record was returned."}`);
  return researchFromRow(data as unknown as ResearchRow, project.id);
}

export async function createPrivateEvidenceAssetUrl(asset: EvidenceAsset, expiresInSeconds = 300) {
  const client = requireClient();
  const { data, error } = await client.storage
    .from(asset.bucketId)
    .createSignedUrl(asset.storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) throw new Error(`Private file could not be opened: ${error?.message ?? "No signed link was returned."}`);
  return data.signedUrl;
}

export async function createCloudResearch(project: Project, input: ResearchDraft) {
  const client = requireClient();
  const cloudProjectId = requireCloudProject(project);
  const clientRef = createResearchClientRef();
  const source = normalizeSource(input.source);
  const sourceText = input.sourceText?.trim();
  const urlMetadata = input.urlMetadata;
  const { data, error } = await client
    .from("research_items")
    .insert({
      client_ref: clientRef,
      project_id: cloudProjectId,
      title: input.title.trim(),
      url: source.url,
      author: urlMetadata?.author ?? null,
      publication: urlMetadata?.publication || source.label,
      published_at: urlMetadata?.publishedAt?.slice(0, 10) ?? null,
      item_type: input.type,
      key_findings: input.summary.trim() || null,
      collection_name: "Unsorted",
      metadata: {
        sift_origin: input.captureOrigin ?? "research_form",
        capture_method: input.captureMethod ?? (source.url ? "url" : "manual"),
        source_label: source.label,
        extraction_status: urlMetadata ? "complete" : input.captureMethod === "url" ? "skipped" : "not_requested",
        ...(urlMetadata ? {
          original_url: urlMetadata.originalUrl,
          final_url: urlMetadata.finalUrl,
          canonical_url: urlMetadata.canonicalUrl,
          description: urlMetadata.description ?? null,
          preview_image: urlMetadata.previewImage ?? null,
          extracted_at: urlMetadata.extractedAt,
        } : {}),
        ...(sourceText ? { source_text: sourceText } : {}),
      },
    })
    .select(researchSelect)
    .single();
  if (error || !data) throw new Error(`Research could not be saved: ${error?.message ?? "No record was returned."}`);
  return researchFromRow(data as unknown as ResearchRow, project.id);
}

export async function deleteCloudResearch(item: ResearchItem) {
  if (!item.cloudId) throw new Error("This research item has not been moved to the cloud yet.");
  const client = requireClient();
  const assets = item.assets ?? [];
  const { data, error } = await client.from("research_items").delete().eq("id", item.cloudId).select("id");
  if (error) throw new Error(`Research could not be deleted: ${error.message}`);
  if (!data?.length) throw new Error("Research deletion was not permitted for the current account.");
  if (!assets.length) return null;
  const cleanupErrors: string[] = [];
  const assetsByBucket = new Map<string, EvidenceAsset[]>();
  for (const asset of assets) assetsByBucket.set(asset.bucketId, [...(assetsByBucket.get(asset.bucketId) ?? []), asset]);
  for (const [bucketId, paths] of assetsByBucket) {
    const { error: cleanupError } = await client.storage.from(bucketId).remove(paths.map((asset) => asset.storagePath));
    if (cleanupError) cleanupErrors.push(cleanupError.message);
  }
  return cleanupErrors.length
    ? "The research record was deleted, but a private file could not be removed from Storage. It is no longer linked in Sift."
    : null;
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
        capture_method: "import",
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
