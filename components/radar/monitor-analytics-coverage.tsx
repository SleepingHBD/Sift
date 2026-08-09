"use client";

import { AlertCircle, ChevronDown, Database, RefreshCw } from "lucide-react";
import type { MonitorAnalysisStatus } from "@/components/radar/use-monitor-analysis";
import type { MonitorSummaryStatus } from "@/components/radar/use-monitor-summary";
import { Badge } from "@/components/ui/primitives";
import type { RadarMonitorSummary } from "@/lib/radar/types";
import { formatNumber } from "@/lib/utils";

export function MonitorAnalyticsCoverage({
  summary,
  status,
  error,
  analysisStatus,
  analysisError,
  fallbackRecords,
  fallbackSources,
  historyTruncated,
}: {
  summary: RadarMonitorSummary | null;
  status: MonitorSummaryStatus;
  error: string;
  analysisStatus: MonitorAnalysisStatus;
  analysisError: string;
  fallbackRecords: number;
  fallbackSources: number;
  historyTruncated: boolean;
}) {
  const records = summary?.metrics.totalMentions ?? fallbackRecords;
  const sources = summary?.metrics.activeSources ?? fallbackSources;
  const authoritative = status === "ready" && summary;
  const analysisAuthoritative = analysisStatus === "ready";
  const calculating = status === "loading" || analysisStatus === "loading";
  const statusLabel = calculating
    ? "Calculating"
    : authoritative && analysisAuthoritative
      ? "Database calculated"
      : authoritative || analysisAuthoritative
        ? "Partly database calculated"
        : "Loaded history";
  const displayStatus = calculating ? "loading" : status === "error" && analysisStatus === "error" ? "error" : "ready";

  return (
    <details className={`analytics-coverage analytics-coverage--${displayStatus}`}>
      <summary>
        <span className="analytics-coverage__icon">{calculating ? <RefreshCw className="spin" size={15} /> : displayStatus === "error" ? <AlertCircle size={15} /> : <Database size={15} />}</span>
        <div className="analytics-coverage__heading">
          <span>Analytics coverage</span>
          <strong>{formatNumber(records)} observed record{records === 1 ? "" : "s"} · {sources} source{sources === 1 ? "" : "s"}</strong>
          <small>{authoritative ? observedSpan(summary.rangeFirstObservedAt, summary.rangeLastObservedAt) : calculating ? "Checking the full Supabase history for this period" : "Based on the conversation history currently loaded in this browser"}</small>
        </div>
        <Badge>{statusLabel}</Badge>
        <ChevronDown size={16} />
      </summary>

      <div className="analytics-coverage__content">
        {authoritative ? (
          <>
            <div className="analytics-coverage__metrics">
              <CoverageMetric label="Selected period" value={formatNumber(summary.metrics.totalMentions)} note="Records included in headline metrics" />
              <CoverageMetric label="Comparison period" value={formatNumber(summary.previousMentions)} note="Baseline for period-over-period change" />
              <CoverageMetric label="Stored history" value={formatNumber(summary.allTimeMentions)} note={summary.scopeTopic ? `Records tagged ${summary.scopeTopic}` : "All records for this monitor"} />
              <CoverageMetric label="Last successful collection" value={summary.lastSuccessfulRunAt ? formatDate(summary.lastSuccessfulRunAt) : "None yet"} note={summary.latestRunStatus ? `Latest run: ${summary.latestRunStatus}` : "No run history"} />
            </div>
            {summary.sources.length ? (
              <div className="analytics-coverage__sources">
                <strong>Sources represented in this period</strong>
                <div>{summary.sources.map((source, index) => <span key={`${source.source}:${source.label}:${index}`}>{source.label}<b>{formatNumber(source.records)}</b></span>)}</div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="analytics-coverage__fallback">
            <AlertCircle size={17} />
            <div>
              <strong>{status === "loading" ? "Calculating the complete period" : "The database summary is temporarily unavailable"}</strong>
              <p>{status === "loading" ? "Sift is checking all monitor records in Supabase. The page remains usable while this finishes." : error || "Sift is showing calculations from the history already loaded in this browser."}</p>
            </div>
          </div>
        )}
        {analysisAuthoritative ? (
          <p className="analytics-coverage__note">Charts, topic counts, keywords, and spike evidence are calculated across the complete selected and comparison periods in Supabase.</p>
        ) : (
          <div className="analytics-coverage__fallback">
            <AlertCircle size={17} />
            <div>
              <strong>{analysisStatus === "loading" ? "Calculating complete conversation patterns" : "Charts are using the history loaded in this browser"}</strong>
              <p>{analysisStatus === "loading" ? "Radar remains usable while its timelines and topic aggregates finish." : analysisError || "Database pattern analysis is not available for this monitor yet."}</p>
            </div>
          </div>
        )}
        <p className="analytics-coverage__note">
          These numbers describe only records Sift successfully collected from configured connectors. They are not a measure of the whole internet or market.
          {!authoritative && historyTruncated ? " This browser has only the newest 5,000 records, so fallback figures are incomplete." : ""}
        </p>
      </div>
    </details>
  );
}

function CoverageMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function observedSpan(first?: string, last?: string) {
  if (!first || !last) return "No collected records fall inside this period";
  if (first.slice(0, 10) === last.slice(0, 10)) return `Observed on ${formatDate(first)}`;
  return `Observed from ${formatDate(first)} to ${formatDate(last)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
