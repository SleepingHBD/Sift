import { stableId } from "./content.ts";
import type { ConnectorCursor, ConnectorSource, MonitorInput } from "./types.ts";

export interface MonitorCursor {
  version: 1;
  monitorFingerprint: string;
  sources: Partial<Record<ConnectorSource, ConnectorCursor>>;
  updatedAt: string;
}

export function readMonitorCursor(value: unknown, monitor: MonitorInput) {
  const candidate = record(value);
  const sources = record(candidate.sources);
  const expectedFingerprint = monitorFingerprint(monitor);
  if (candidate.version !== 1 || candidate.monitorFingerprint !== expectedFingerprint) {
    return { cursor: emptyMonitorCursor(monitor), incremental: false };
  }

  const parsedSources: MonitorCursor["sources"] = {};
  for (const source of ["rss", "manual", "youtube"] as const) {
    const sourceValue = record(sources[source]);
    if (Object.keys(sourceValue).length) parsedSources[source] = sourceValue;
  }
  return {
    cursor: {
      version: 1 as const,
      monitorFingerprint: expectedFingerprint,
      sources: parsedSources,
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date(0).toISOString(),
    },
    incremental: Object.keys(parsedSources).length > 0,
  };
}

export function sourceCursor(cursor: MonitorCursor, source: ConnectorSource) {
  return cursor.sources[source];
}

export function advanceMonitorCursor(
  current: MonitorCursor,
  outcomes: { source: ConnectorSource; status: "completed" | "failed"; cursor?: ConnectorCursor }[],
  updatedAt = new Date().toISOString(),
) {
  const sources = { ...current.sources };
  const advancedSources: ConnectorSource[] = [];
  for (const outcome of outcomes) {
    if (outcome.status !== "completed" || !outcome.cursor || !Object.keys(outcome.cursor).length) continue;
    if (JSON.stringify(sources[outcome.source] ?? null) !== JSON.stringify(outcome.cursor)) advancedSources.push(outcome.source);
    sources[outcome.source] = outcome.cursor;
  }
  return {
    cursor: { ...current, sources, updatedAt } satisfies MonitorCursor,
    advancedSources,
  };
}

function emptyMonitorCursor(monitor: MonitorInput): MonitorCursor {
  return {
    version: 1,
    monitorFingerprint: monitorFingerprint(monitor),
    sources: {},
    updatedAt: new Date(0).toISOString(),
  };
}

function monitorFingerprint(monitor: MonitorInput) {
  return stableId(JSON.stringify({
    query: monitor.query,
    builder: monitor.builder,
    language: monitor.language,
    market: monitor.market,
  }));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
