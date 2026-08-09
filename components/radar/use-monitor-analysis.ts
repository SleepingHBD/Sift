"use client";

import { useEffect, useState } from "react";
import { getCloudRadarMonitorAnalysis } from "@/lib/radar/repository";
import type { DateBounds, DateRangeKey, RadarMonitorAnalysis } from "@/lib/radar/types";

export type MonitorAnalysisStatus = "idle" | "loading" | "ready" | "error";

export function useMonitorAnalysis({
  monitorId,
  monitorClientId,
  bounds,
  range,
  topic,
  refreshKey,
}: {
  monitorId?: string;
  monitorClientId?: string;
  bounds: DateBounds;
  range: DateRangeKey;
  topic?: string;
  refreshKey?: string | number;
}) {
  const start = bounds.start.toISOString();
  const end = bounds.end.toISOString();
  const previousStart = bounds.previousStart.toISOString();
  const previousEnd = bounds.previousEnd.toISOString();
  const requestKey = [monitorId, monitorClientId, start, end, previousStart, previousEnd, range, topic, refreshKey].join("|");
  const [result, setResult] = useState<{
    key: string;
    analysis: RadarMonitorAnalysis | null;
    status: MonitorAnalysisStatus;
    error: string;
  }>({ key: "", analysis: null, status: "idle", error: "" });

  useEffect(() => {
    let cancelled = false;
    if (!monitorId || !monitorClientId) return;
    void getCloudRadarMonitorAnalysis(monitorId, monitorClientId, {
      start: new Date(start),
      end: new Date(end),
      previousStart: new Date(previousStart),
      previousEnd: new Date(previousEnd),
    }, range, topic).then((next) => {
      if (cancelled) return;
      setResult({ key: requestKey, analysis: next, status: "ready", error: "" });
    }).catch((cause: unknown) => {
      if (cancelled) return;
      setResult({
        key: requestKey,
        analysis: null,
        status: "error",
        error: cause instanceof Error ? cause.message : "Radar timelines could not be calculated.",
      });
    });

    return () => { cancelled = true; };
  }, [end, monitorClientId, monitorId, previousEnd, previousStart, range, requestKey, start, topic]);

  if (!monitorId || !monitorClientId) return { analysis: null, status: "idle" as const, error: "" };
  if (result.key !== requestKey) return { analysis: null, status: "loading" as const, error: "" };
  return { analysis: result.analysis, status: result.status, error: result.error };
}
