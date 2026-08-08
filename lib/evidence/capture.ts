import type { EvidenceCaptureMethod } from "./reference.ts";

export type QuickCaptureMode = "url" | "note";

export interface QuickCaptureDraft {
  mode: QuickCaptureMode;
  projectId: string;
  source: string;
  note: string;
  title: string;
  whyItMatters: string;
}

export interface PreparedQuickCapture {
  projectId: string;
  title: string;
  type: "URL" | "Note";
  source: string;
  sourceText: string;
  summary: string;
  captureMethod: EvidenceCaptureMethod;
  captureOrigin: "global_capture";
}

export type QuickCaptureField = "projectId" | "source" | "note";

export type QuickCaptureResult =
  | { ok: true; value: PreparedQuickCapture }
  | { ok: false; errors: Partial<Record<QuickCaptureField, string>> };

function readableNoteTitle(value: string) {
  const firstLine = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "Untitled note";
  return firstLine.length > 72 ? `${firstLine.slice(0, 71).trimEnd()}…` : firstLine;
}

export function normalizeCaptureUrl(value: string) {
  const input = value.trim();
  if (!input) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function captureTitleFromUrl(value: string) {
  const normalized = normalizeCaptureUrl(value);
  if (!normalized) return "Saved source";
  const url = new URL(normalized);
  return url.hostname.replace(/^www\./, "");
}

export function prepareQuickCapture(draft: QuickCaptureDraft): QuickCaptureResult {
  const errors: Partial<Record<QuickCaptureField, string>> = {};
  if (!draft.projectId.trim()) errors.projectId = "Choose a project for this evidence.";

  if (draft.mode === "url") {
    const source = normalizeCaptureUrl(draft.source);
    if (!source) errors.source = "Enter a valid public web address.";
    if (Object.keys(errors).length || !source) return { ok: false, errors };
    return {
      ok: true,
      value: {
        projectId: draft.projectId,
        title: draft.title.trim() || captureTitleFromUrl(source),
        type: "URL",
        source,
        sourceText: "",
        summary: draft.whyItMatters.trim(),
        captureMethod: "url",
        captureOrigin: "global_capture",
      },
    };
  }

  const note = draft.note.trim();
  if (!note) errors.note = "Write or paste the note you want to preserve.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      projectId: draft.projectId,
      title: draft.title.trim() || readableNoteTitle(note),
      type: "Note",
      source: "Personal note",
      sourceText: note,
      summary: draft.whyItMatters.trim(),
      captureMethod: "manual",
      captureOrigin: "global_capture",
    },
  };
}
