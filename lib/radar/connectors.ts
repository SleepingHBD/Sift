import type { ConnectorDescriptor, MonitoringQuery } from "./types";

export const radarConnectors: ConnectorDescriptor[] = [
  { id: "reddit", source: "reddit", name: "Reddit", state: "not-connected", description: "Requires approved Reddit API credentials before retrieval.", capabilities: ["Search", "Posts", "Comments"] },
  { id: "youtube", source: "youtube", name: "YouTube", state: "available", description: "Official video search and public top-level comment retrieval. Requires a server-side API key.", capabilities: ["Videos", "Comments"] },
  { id: "rss", source: "rss", name: "RSS & Atom", state: "available", description: "Collects matching articles from permitted public feed URLs.", capabilities: ["Feed retrieval", "Articles"] },
  { id: "news", source: "news", name: "News API", state: "not-connected", description: "Requires a licensed provider and credentials.", capabilities: ["Article search"] },
  { id: "manual", source: "manual", name: "Manual URL import", state: "available", description: "Normalizes user-supplied public articles and web pages as evidence.", capabilities: ["URL import", "Page metadata"] },
  { id: "tiktok", source: "tiktok", name: "TikTok", state: "coming-later", description: "No connector is implemented. Official access is required.", capabilities: [] },
  { id: "instagram", source: "instagram", name: "Instagram", state: "coming-later", description: "No connector is implemented. Official access is required.", capabilities: [] },
  { id: "facebook", source: "facebook", name: "Facebook", state: "coming-later", description: "No connector is implemented. Official access is required.", capabilities: [] },
  { id: "linkedin", source: "linkedin", name: "LinkedIn", state: "coming-later", description: "No connector is implemented. Official access is required.", capabilities: [] },
  { id: "x", source: "x", name: "X", state: "coming-later", description: "No connector is implemented. Official access is required.", capabilities: [] },
];

export function createDraftMonitor(id: string, values: Omit<MonitoringQuery, "id" | "createdAt" | "lastRunAt" | "dataMode">): MonitoringQuery {
  return { ...values, id, createdAt: new Date().toISOString(), dataMode: "empty" };
}
