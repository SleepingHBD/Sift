import type { MonitorRun, RadarSource } from "./types.ts";

export interface SourceHealth {
  source: RadarSource;
  latestResult?: MonitorRun["sourceResults"][number];
  lastSuccessfulAt?: string;
}

export function monitorRuns(runs: MonitorRun[], monitorId: string) {
  return runs
    .filter((run) => run.monitorId === monitorId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export function sourceHealthForRuns(runs: MonitorRun[], sources: RadarSource[]): SourceHealth[] {
  const orderedSources = [...new Set([...sources, ...runs.flatMap((run) => run.connectorIds)])];
  return orderedSources.map((source) => {
    const latestResult = runs.flatMap((run) => run.sourceResults).find((result) => result.source === source);
    const successfulRun = runs.find((run) => run.sourceResults.some((result) => result.source === source && result.status === "completed"));
    return { source, latestResult, lastSuccessfulAt: successfulRun?.completedAt ?? successfulRun?.startedAt };
  });
}

export function runHealthStatus(run: MonitorRun | undefined) {
  if (!run) return "empty" as const;
  if (run.status === "running") return "running" as const;
  if (run.status === "failed" || run.sourceResults.every((result) => result.status === "failed")) return "failed" as const;
  if (run.sourceResults.some((result) => result.status === "failed")) return "partial" as const;
  return "healthy" as const;
}

export function runDuration(run: MonitorRun) {
  if (typeof run.durationMs === "number") return run.durationMs;
  if (!run.completedAt) return 0;
  return Math.max(0, new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime());
}
