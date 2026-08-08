import {
  inspirationItemToEvidenceReference,
  radarMentionToEvidenceReference,
  researchItemToEvidenceReference,
  type EvidenceKind,
  type EvidenceReference,
  type EvidenceReviewStatus,
} from "./reference.ts";
import type { RadarMention } from "../radar/types.ts";
import type { InspirationItem, Project, ResearchItem } from "../types.ts";

export type EvidenceInboxView = "all" | "needs-review" | "recent";
export type EvidenceInboxKindFilter = "all" | EvidenceKind;

export interface RadarInboxRecord {
  mention: RadarMention;
  projectClientRef: string;
}

export interface EvidenceInboxDataset {
  items: EvidenceReference[];
  excludedRadarCount: number;
}

export interface EvidenceInboxFilters {
  query: string;
  projectId: string;
  kind: EvidenceInboxKindFilter;
  view: EvidenceInboxView;
  reviewStatus?: "all" | EvidenceReviewStatus;
  now?: Date;
}

function projectIdentity(project: Project) {
  return project.cloudId ?? project.id;
}

function validTime(value: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function buildEvidenceInbox({
  projects,
  radarRecords,
  researchItems,
  inspirationItems,
}: {
  projects: Project[];
  radarRecords: RadarInboxRecord[];
  researchItems: ResearchItem[];
  inspirationItems: InspirationItem[];
}): EvidenceInboxDataset {
  const projectsByClientRef = new Map(projects.map((project) => [project.id, project]));
  const items: EvidenceReference[] = [];
  let excludedRadarCount = 0;

  for (const record of radarRecords) {
    const project = projectsByClientRef.get(record.projectClientRef);
    if (!project) {
      excludedRadarCount += 1;
      continue;
    }
    items.push(radarMentionToEvidenceReference(record.mention, {
      cloudProjectId: project.cloudId,
      projectClientRef: project.id,
    }));
  }

  for (const item of researchItems) {
    const project = projectsByClientRef.get(item.projectId);
    if (!project) continue;
    items.push(researchItemToEvidenceReference(item, {
      cloudProjectId: project.cloudId,
      projectClientRef: project.id,
    }));
  }

  for (const item of inspirationItems) {
    const project = projectsByClientRef.get(item.projectId);
    if (!project) continue;
    items.push(inspirationItemToEvidenceReference(item, {
      cloudProjectId: project.cloudId,
      projectClientRef: project.id,
    }));
  }

  const deduplicated = new Map<string, EvidenceReference>();
  for (const item of items) deduplicated.set(`${item.kind}:${item.id}`, item);

  return {
    items: [...deduplicated.values()].sort((a, b) => validTime(b.capturedAt) - validTime(a.capturedAt)),
    excludedRadarCount,
  };
}

export function filterEvidenceInbox(items: EvidenceReference[], filters: EvidenceInboxFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  const recentBoundary = (filters.now ?? new Date()).getTime() - (7 * 24 * 60 * 60 * 1_000);

  return items.filter((item) => {
    if (filters.projectId !== "all" && item.projectId !== filters.projectId) return false;
    if (filters.kind !== "all" && item.kind !== filters.kind) return false;
    if (filters.reviewStatus && filters.reviewStatus !== "all" && item.reviewStatus !== filters.reviewStatus) return false;
    if (filters.view === "needs-review" && item.reviewStatus !== "unreviewed") return false;
    if (filters.view === "recent" && validTime(item.capturedAt) < recentBoundary) return false;
    if (!query) return true;

    const searchable = [
      item.title,
      item.author,
      item.sourceLabel,
      item.originalContent,
      item.excerpt,
      item.notes,
      item.language,
      item.provenance.captureMethod,
      ...item.tags,
      ...item.topics,
    ].filter(Boolean).join("\n").toLocaleLowerCase();
    return searchable.includes(query);
  });
}

export function evidenceKindLabel(kind: EvidenceKind) {
  if (kind === "mention") return "Radar mention";
  if (kind === "research") return "Research";
  return "Inspiration";
}

export function captureMethodLabel(method: EvidenceReference["provenance"]["captureMethod"]) {
  const labels: Record<EvidenceReference["provenance"]["captureMethod"], string> = {
    connector: "Connector collected",
    url: "URL captured",
    manual: "Manually added",
    strategist: "Strategist captured",
    import: "Imported",
    upload: "Uploaded",
    unknown: "Capture method unknown",
  };
  return labels[method];
}

export function evidenceReviewLabel(status: EvidenceReviewStatus) {
  const labels: Record<EvidenceReviewStatus, string> = {
    unreviewed: "Needs review",
    relevant: "Relevant",
    irrelevant: "Not relevant",
    archived: "Archived",
  };
  return labels[status];
}

export function projectEvidenceId(project: Project) {
  return projectIdentity(project);
}
