"use client";

import { useEffect, useState } from "react";
import { getCloudRadarMonitorSummary } from "@/lib/radar/repository";
import type { DateBounds, RadarMonitorSummary } from "@/lib/radar/types";

export type MonitorSummaryStatus = "idle" | "loading" | "ready" | "error";

export function useMonitorSummary({
  monitorId,
  bounds,
  topic,
  refreshKey,
}: {
  monitorId?: string;
  bounds: DateBounds;
  topic?: string;
  refreshKey?: string | number;
}) {
  const start = bounds.start.toISOString();
  const end = bounds.end.toISOString();
  const previousStart = bounds.previousStart.toISOString();
  const previousEnd = bounds.previousEnd.toISOString();
  const requestKey = [monitorId, start, end, previousStart, previousEnd, topic, refreshKey].join("|");
  const [result, setResult] = useState<{
    key: string;
    summary: RadarMonitorSummary | null;
    status: MonitorSummaryStatus;
    error: string;
  }>({ key: "", summary: null, status: "idle", error: "" });

  useEffect(() => {
    let cancelled = false;
    if (!monitorId) return;
    void getCloudRadarMonitorSummary(monitorId, {
      start: new Date(start),
      end: new Date(end),
      previousStart: new Date(previousStart),
      previousEnd: new Date(previousEnd),
    }, topic).then((next) => {
      if (cancelled) return;
      setResult({ key: requestKey, summary: next, status: "ready", error: "" });
    }).catch((cause: unknown) => {
      if (cancelled) return;
      setResult({
        key: requestKey,
        summary: null,
        status: "error",
        error: cause instanceof Error ? cause.message : "Radar analytics could not be calculated.",
      });
    });

    return () => { cancelled = true; };
  }, [end, monitorId, previousEnd, previousStart, requestKey, start, topic]);

  if (!monitorId) return { summary: null, status: "idle" as const, error: "" };
  if (result.key !== requestKey) return { summary: null, status: "loading" as const, error: "" };
  return { summary: result.summary, status: result.status, error: result.error };
}
