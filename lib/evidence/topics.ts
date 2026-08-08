import type { EvidenceReference } from "./reference.ts";
import { evidenceKey } from "./organization.ts";

export interface EvidenceTopic {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
function uniqueLabels(values: string[]) {
  const labels = new Map<string, string>();
  for (const value of values) {
    const clean = value.trim().replace(/\s+/g, " ");
    if (!clean) continue;
    const key = clean.toLocaleLowerCase();
    if (!labels.has(key)) labels.set(key, clean);
  }
  return [...labels.values()];
}

export function normalizeEvidenceTopics(input: string | string[]) {
  const values = Array.isArray(input) ? input : input.split(/[\n,]/);
  return uniqueLabels(values.map((value) => value.slice(0, 60))).slice(0, 10);
}

export function evidenceTopicSlug(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function updateEvidenceItemTopics(
  items: EvidenceReference[],
  keys: string[],
  topics: string[],
  mode: "add" | "remove",
) {
  const confirmed = new Set(keys);
  const normalized = normalizeEvidenceTopics(topics);
  const changed = new Set(normalized.map((topic) => topic.toLocaleLowerCase()));

  return items.map((item) => {
    if (!confirmed.has(evidenceKey(item))) return item;
    const organizationTopics = mode === "add"
      ? uniqueLabels([...item.organizationTopics, ...normalized])
      : item.organizationTopics.filter((topic) => !changed.has(topic.toLocaleLowerCase()));
    return { ...item, organizationTopics };
  });
}
