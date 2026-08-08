import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Project, ResearchItem } from "@/lib/types";

export interface EvidenceUrlMetadata {
  originalUrl: string;
  finalUrl: string;
  canonicalUrl: string;
  title: string;
  description?: string;
  author?: string;
  publication: string;
  publishedAt?: string;
  previewImage?: string;
  extractedAt: string;
}

export interface DuplicateEvidence {
  id: string;
  clientRef: string | null;
  title: string;
  url: string | null;
  createdAt: string | null;
}

export interface EvidenceUrlInspection {
  metadata: EvidenceUrlMetadata;
  duplicate: DuplicateEvidence | null;
}

export async function inspectEvidenceUrl(project: Project, url: string): Promise<EvidenceUrlInspection> {
  if (!project.cloudId) throw new Error("Choose a project that has been moved to the cloud.");
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured for this build.");
  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Sign in with GitHub before inspecting a link.");

  client.functions.setAuth(accessToken);
  const functionName = process.env.NEXT_PUBLIC_RADAR_FUNCTION_NAME || "radar-connectors";
  const { data, error } = await client.functions.invoke(functionName, {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { action: "extract-url", projectId: project.cloudId, url },
  });
  if (error) throw new Error(await readFunctionError(error));
  if (!isInspection(data)) throw new Error("The link inspection service returned an invalid response.");
  return data;
}

export function findLocalUrlDuplicate(items: ResearchItem[], projectId: string, urls: string[]) {
  const candidates = new Set(urls.map(comparableEvidenceUrl).filter(Boolean));
  if (!candidates.size) return null;
  return items.find((item) => {
    if (item.projectId !== projectId) return false;
    const metadata = item.metadata ?? {};
    const saved = [item.url, metadata.original_url, metadata.final_url, metadata.canonical_url]
      .filter((value): value is string => typeof value === "string")
      .map(comparableEvidenceUrl);
    return saved.some((value) => candidates.has(value));
  }) ?? null;
}

export function comparableEvidenceUrl(input: string) {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

async function readFunctionError(error: { message: string; context?: unknown }) {
  const response = error.context;
  if (response instanceof Response) {
    try {
      const body = await response.json() as { error?: string };
      if (body.error) return body.error;
    } catch {
      // Use the SDK message if the function did not return JSON.
    }
  }
  return error.message;
}

function isInspection(value: unknown): value is EvidenceUrlInspection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EvidenceUrlInspection>;
  const metadata = candidate.metadata as Partial<EvidenceUrlMetadata> | undefined;
  return Boolean(
    metadata
    && typeof metadata.originalUrl === "string"
    && typeof metadata.finalUrl === "string"
    && typeof metadata.canonicalUrl === "string"
    && typeof metadata.title === "string"
    && typeof metadata.publication === "string"
    && typeof metadata.extractedAt === "string"
    && (candidate.duplicate === null || isDuplicate(candidate.duplicate)),
  );
}

function isDuplicate(value: unknown): value is DuplicateEvidence {
  return Boolean(value && typeof value === "object" && "id" in value && typeof value.id === "string" && "title" in value && typeof value.title === "string");
}
