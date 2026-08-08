import type { EvidenceReference } from "./reference.ts";

export interface EvidenceOrganizationSnapshot {
  tagsByEvidence: Record<string, string[]>;
  projectIdsByEvidence: Record<string, string[]>;
}

export interface EvidenceBulkFailure {
  key: string;
  title: string;
  message: string;
}

export interface EvidenceBulkResult {
  attempted: number;
  succeededKeys: string[];
  failures: EvidenceBulkFailure[];
}

export const emptyEvidenceOrganization: EvidenceOrganizationSnapshot = {
  tagsByEvidence: {},
  projectIdsByEvidence: {},
};

export function evidenceKey(item: Pick<EvidenceReference, "kind" | "id">) {
  return `${item.kind}:${item.id}`;
}

export function normalizeEvidenceTags(input: string | string[]) {
  const values = Array.isArray(input) ? input : input.split(/[\n,]/);
  const normalized = new Map<string, string>();

  for (const value of values) {
    const clean = value.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!clean) continue;
    const key = clean.toLocaleLowerCase();
    if (!normalized.has(key)) normalized.set(key, clean);
    if (normalized.size === 10) break;
  }

  return [...normalized.values()];
}

function uniqueLabels(values: string[]) {
  const labels = new Map<string, string>();
  for (const value of values) {
    const clean = value.trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase();
    if (!labels.has(key)) labels.set(key, clean);
  }
  return [...labels.values()];
}

export function applyEvidenceOrganization(
  item: EvidenceReference,
  organization: EvidenceOrganizationSnapshot,
): EvidenceReference {
  const key = evidenceKey(item);
  const organizationTags = organization.tagsByEvidence[key] ?? [];
  const associatedProjectIds = uniqueLabels([
    item.projectId,
    ...(organization.projectIdsByEvidence[key] ?? []),
  ]);

  return {
    ...item,
    tags: uniqueLabels([...item.tags, ...organizationTags]),
    organizationTags: uniqueLabels(organizationTags),
    associatedProjectIds,
  };
}

export function updateOrganizationTags(
  current: EvidenceOrganizationSnapshot,
  keys: string[],
  tags: string[],
  mode: "add" | "remove",
): EvidenceOrganizationSnapshot {
  const next = { ...current.tagsByEvidence };
  const normalized = normalizeEvidenceTags(tags);
  const normalizedKeys = new Set(normalized.map((tag) => tag.toLocaleLowerCase()));

  for (const key of keys) {
    const existing = next[key] ?? [];
    next[key] = mode === "add"
      ? uniqueLabels([...existing, ...normalized])
      : existing.filter((tag) => !normalizedKeys.has(tag.toLocaleLowerCase()));
  }

  return { ...current, tagsByEvidence: next };
}

export function addOrganizationProject(
  current: EvidenceOrganizationSnapshot,
  keys: string[],
  projectId: string,
): EvidenceOrganizationSnapshot {
  const next = { ...current.projectIdsByEvidence };
  for (const key of keys) next[key] = uniqueLabels([...(next[key] ?? []), projectId]);
  return { ...current, projectIdsByEvidence: next };
}

export function updateEvidenceItemTags(
  items: EvidenceReference[],
  keys: string[],
  tags: string[],
  mode: "add" | "remove",
) {
  const confirmed = new Set(keys);
  const normalized = normalizeEvidenceTags(tags);
  const changed = new Set(normalized.map((tag) => tag.toLocaleLowerCase()));

  return items.map((item) => {
    if (!confirmed.has(evidenceKey(item))) return item;
    const sourceTags = item.tags.filter((tag) => !item.organizationTags.some((shared) => shared.toLocaleLowerCase() === tag.toLocaleLowerCase()));
    const organizationTags = mode === "add"
      ? uniqueLabels([...item.organizationTags, ...normalized])
      : item.organizationTags.filter((tag) => !changed.has(tag.toLocaleLowerCase()));
    return { ...item, organizationTags, tags: uniqueLabels([...sourceTags, ...organizationTags]) };
  });
}

export function addEvidenceItemProject(items: EvidenceReference[], keys: string[], projectId: string) {
  const confirmed = new Set(keys);
  return items.map((item) => confirmed.has(evidenceKey(item))
    ? { ...item, associatedProjectIds: uniqueLabels([...item.associatedProjectIds, projectId]) }
    : item);
}
