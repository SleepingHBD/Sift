import type { Project } from "../types.ts";

export type ProjectStatus = "active" | "archived";

export interface RelatedNameRow {
  id: string;
  name: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

export interface ProjectRow {
  id: string;
  client_ref: string | null;
  name: string;
  description: string | null;
  market: string | null;
  focus: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  brands?: RelatedNameRow[] | null;
  competitors?: RelatedNameRow[] | null;
  mentions?: { count: number }[] | null;
  research_items?: { count: number }[] | null;
  insights?: { count: number }[] | null;
}

const projectAccents = ["#dfff4f", "#93b8ff", "#ff7d68", "#bd9cff", "#72e99b"];

function countFrom(value: { count: number }[] | null | undefined) {
  return Number(value?.[0]?.count ?? 0);
}

function stableAccent(value: string) {
  let hash = 0;
  for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return projectAccents[Math.abs(hash) % projectAccents.length];
}

export function primaryBrand(rows: RelatedNameRow[] | null | undefined) {
  return rows?.find((row) => row.metadata?.sift_role === "primary") ?? rows?.[0];
}

export function projectFromRow(row: ProjectRow): Project {
  const clientRef = row.client_ref ?? row.id;
  return {
    id: clientRef,
    cloudId: row.id,
    clientRef,
    name: row.name,
    brand: primaryBrand(row.brands)?.name ?? "",
    market: row.market ?? "",
    focus: row.focus ?? row.description ?? "",
    description: row.description ?? "",
    competitors: (row.competitors ?? []).map((competitor) => competitor.name),
    accent: stableAccent(clientRef),
    counts: {
      mentions: countFrom(row.mentions),
      research: countFrom(row.research_items),
      insights: countFrom(row.insights),
    },
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createProjectClientRef(randomUuid = () => crypto.randomUUID()) {
  return `project-${randomUuid()}`;
}
