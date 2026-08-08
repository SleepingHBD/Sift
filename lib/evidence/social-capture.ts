import { normalizeCaptureUrl } from "./capture.ts";
import { validateEvidenceFile, type EvidenceFileDescriptor } from "./file-capture.ts";

export const socialPlatforms = [
  "Instagram",
  "TikTok",
  "LinkedIn",
  "X",
  "Facebook",
  "Reddit",
  "YouTube",
  "Other",
] as const;

export type SocialPlatform = (typeof socialPlatforms)[number];

export interface SocialCaptureDraft {
  projectId: string;
  source: string;
  platform: SocialPlatform;
  author: string;
  caption: string;
  selectedComments: string;
  observedAt: string;
  title: string;
  whyItMatters: string;
}

export interface PreparedSocialCapture {
  projectId: string;
  source: string;
  platform: SocialPlatform;
  author: string;
  caption: string;
  selectedComments: string;
  observedAt: string;
  title: string;
  summary: string;
  captureMethod: "strategist";
  captureOrigin: "social_capture";
}

export type SocialCaptureField = "projectId" | "source" | "platform" | "observedAt" | "screenshot";

export type SocialCaptureResult =
  | { ok: true; value: PreparedSocialCapture }
  | { ok: false; errors: Partial<Record<SocialCaptureField, string>> };

const platformHosts: Array<[RegExp, SocialPlatform]> = [
  [/(^|\.)instagram\.com$/i, "Instagram"],
  [/(^|\.)tiktok\.com$/i, "TikTok"],
  [/(^|\.)linkedin\.com$/i, "LinkedIn"],
  [/(^|\.)(x|twitter)\.com$/i, "X"],
  [/(^|\.)facebook\.com$/i, "Facebook"],
  [/(^|\.)reddit\.com$/i, "Reddit"],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, "YouTube"],
];

function socialTitle(platform: SocialPlatform, author: string) {
  return author ? `${platform} post · ${author}` : `${platform} post`;
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function inferSocialPlatform(value: string): SocialPlatform {
  const normalized = normalizeCaptureUrl(value);
  if (!normalized) return "Other";
  const hostname = new URL(normalized).hostname.replace(/^www\./i, "");
  return platformHosts.find(([pattern]) => pattern.test(hostname))?.[1] ?? "Other";
}

export function validateSocialScreenshot(file: EvidenceFileDescriptor) {
  const validation = validateEvidenceFile(file);
  if (!validation.ok) return validation;
  if (validation.kind !== "image") {
    return { ok: false as const, error: "Use a JPG, PNG, or WebP screenshot." };
  }
  return validation;
}

export function prepareSocialCapture(draft: SocialCaptureDraft): SocialCaptureResult {
  const errors: Partial<Record<SocialCaptureField, string>> = {};
  const source = normalizeCaptureUrl(draft.source);
  const author = draft.author.trim();
  const platform = socialPlatforms.includes(draft.platform) ? draft.platform : "Other";

  if (!draft.projectId.trim()) errors.projectId = "Choose a project for this evidence.";
  if (!source) errors.source = "Enter a valid public social post address.";
  if (!socialPlatforms.includes(draft.platform)) errors.platform = "Choose a valid platform.";
  if (draft.observedAt && !isValidDateInput(draft.observedAt)) errors.observedAt = "Choose a valid observed date.";
  if (Object.keys(errors).length || !source) return { ok: false, errors };

  return {
    ok: true,
    value: {
      projectId: draft.projectId,
      source,
      platform,
      author,
      caption: draft.caption.trim(),
      selectedComments: draft.selectedComments.trim(),
      observedAt: draft.observedAt,
      title: draft.title.trim() || socialTitle(platform, author),
      summary: draft.whyItMatters.trim(),
      captureMethod: "strategist",
      captureOrigin: "social_capture",
    },
  };
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export interface SocialCaptureDetails {
  platform: string;
  author: string;
  caption: string;
  selectedComments: string;
  observedAt: string;
}

export function getSocialCaptureDetails(value: unknown): SocialCaptureDetails | null {
  const metadata = metadataRecord(value);
  if (metadataText(metadata, "sift_origin") !== "social_capture") return null;
  return {
    platform: metadataText(metadata, "social_platform") || metadataText(metadata, "source_label") || "Social platform",
    author: metadataText(metadata, "social_author"),
    caption: metadataText(metadata, "source_text"),
    selectedComments: metadataText(metadata, "selected_comments"),
    observedAt: metadataText(metadata, "observed_at"),
  };
}
