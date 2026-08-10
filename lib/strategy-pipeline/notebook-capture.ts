import { normalizeCaptureUrl } from "../evidence/capture.ts";

const publicUrlPattern = /(?:https?:\/\/|www\.)[^\s<>{}"']+/i;
const trailingPunctuation = /[),.;:!?]+$/;

export function findNotebookUrl(value: string) {
  const match = value.match(publicUrlPattern)?.[0];
  if (!match) return null;
  return normalizeCaptureUrl(match.replace(trailingPunctuation, ""));
}
