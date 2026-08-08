export const EVIDENCE_ASSET_BUCKET = "evidence-assets";
export const MAX_EVIDENCE_FILE_BYTES = 20 * 1024 * 1024;

export const evidenceFileTypes = {
  "image/jpeg": { extension: "jpg", kind: "image" },
  "image/png": { extension: "png", kind: "image" },
  "image/webp": { extension: "webp", kind: "image" },
  "application/pdf": { extension: "pdf", kind: "document" },
} as const;

export type EvidenceFileMimeType = keyof typeof evidenceFileTypes;
export type EvidenceFileKind = (typeof evidenceFileTypes)[EvidenceFileMimeType]["kind"];

export interface EvidenceFileDescriptor {
  name: string;
  type: string;
  size: number;
}

export type EvidenceFileValidation =
  | { ok: true; mimeType: EvidenceFileMimeType; kind: EvidenceFileKind }
  | { ok: false; error: string };

export function validateEvidenceFile(file: EvidenceFileDescriptor): EvidenceFileValidation {
  if (!file.name.trim()) return { ok: false, error: "Choose a file with a valid name." };
  if (file.name.length > 255) return { ok: false, error: "The filename must be 255 characters or shorter." };
  if (!Number.isFinite(file.size) || file.size < 1) return { ok: false, error: "This file is empty." };
  if (file.size > MAX_EVIDENCE_FILE_BYTES) return { ok: false, error: "Files must be 20 MB or smaller." };
  if (!(file.type in evidenceFileTypes)) {
    return { ok: false, error: "Use a JPG, PNG, WebP, or PDF file." };
  }
  const mimeType = file.type as EvidenceFileMimeType;
  return { ok: true, mimeType, kind: evidenceFileTypes[mimeType].kind };
}

function safeBaseName(filename: string) {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  const safe = withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return safe || "evidence";
}

export function createEvidenceStoragePath(input: {
  userId: string;
  projectId: string;
  researchClientRef: string;
  filename: string;
  mimeType: EvidenceFileMimeType;
  randomUuid?: () => string;
}) {
  const randomUuid = input.randomUuid ?? (() => crypto.randomUUID());
  const extension = evidenceFileTypes[input.mimeType].extension;
  return `${input.userId}/${input.projectId}/${input.researchClientRef}/${randomUuid()}-${safeBaseName(input.filename)}.${extension}`;
}

export function formatEvidenceFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
