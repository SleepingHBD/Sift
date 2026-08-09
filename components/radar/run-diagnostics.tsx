"use client";

import { Activity, AlertTriangle, Check, ChevronDown, Database, Link2, Rss, Youtube } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { monitorRuns, runDuration, runHealthStatus, sourceHealthForRuns } from "@/lib/radar/run-diagnostics";
import type { MonitorRun, RadarSource } from "@/lib/radar/types";

export function RunDiagnostics({ monitorId, selectedSources, runs }: { monitorId: string; selectedSources: RadarSource[]; runs: MonitorRun[] }) {
  const history = monitorRuns(runs, monitorId);
  const latest = history[0];
  const health = runHealthStatus(latest);
  const sources = sourceHealthForRuns(history, selectedSources);

  return (
    <details className={`run-diagnostics run-diagnostics--${health}`}>
      <summary>
        <div className="run-diagnostics__heading">
          <span>Collection health</span>
          <strong>{healthLabel(health)}</strong>
          <small>{latest ? `Last run ${relativeDate(latest.completedAt ?? latest.startedAt)}` : "Run this monitor to record source health"}</small>
        </div>
        {latest ? <Badge>{latest.mentionsFetched} fetched</Badge> : <Badge>No runs</Badge>}
        <ChevronDown size={16} />
      </summary>

      <div className="run-diagnostics__content">
        {!latest ? (
          <div className="run-diagnostics__empty"><Activity size={18} /><div><strong>No collection history yet</strong><p>After the first run, Sift will show what each source returned, how long it took, and whether anything failed.</p></div></div>
        ) : (
          <>
            <div className="run-diagnostics__metrics">
              <DiagnosticMetric label="Retrieved" value={latest.mentionsFetched} note="Before deduplication" />
              <DiagnosticMetric label="New" value={latest.mentionsCreated} note="Created in Sift" />
              <DiagnosticMetric label="Refreshed" value={latest.mentionsUpdated ?? 0} note="Existing records updated" />
              <DiagnosticMetric label="Duplicates" value={latest.duplicatesRemoved ?? 0} note="Removed in this run" />
              <DiagnosticMetric label="Duration" value={durationLabel(runDuration(latest))} note="Whole collection run" />
            </div>

            <section className="run-diagnostics__sources" aria-label="Source health">
              <header><strong>Sources</strong><span>Latest result and most recent success</span></header>
              {sources.map((source) => <SourceHealthRow key={source.source} health={source} />)}
            </section>

            <div className="run-diagnostics__footer">
              {latest.quota ? <span><Database size={13} />Run allowance after collection: {latest.quota.remainingMinute} this minute · {latest.quota.remainingDay} today</span> : <span><Database size={13} />Quota information was not recorded for this run.</span>}
              <span>{latest.persisted ? <><Check size={13} />Saved to Supabase</> : <><AlertTriangle size={13} />Not confirmed in Supabase</>}</span>
            </div>

            {history.length > 1 ? (
              <section className="run-diagnostics__history">
                <header><strong>Recent runs</strong><span>Newest first</span></header>
                {history.slice(0, 5).map((run) => {
                  const status = runHealthStatus(run);
                  return <div key={run.id}><span className={`run-diagnostics__dot run-diagnostics__dot--${status}`} /><time dateTime={run.startedAt}>{formatDate(run.startedAt)}</time><strong>{healthLabel(status)}</strong><small>{run.mentionsFetched} fetched · {run.mentionsCreated} new · {durationLabel(runDuration(run))}</small></div>;
                })}
              </section>
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}

function DiagnosticMetric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function SourceHealthRow({ health }: { health: ReturnType<typeof sourceHealthForRuns>[number] }) {
  const result = health.latestResult;
  const failed = result?.status === "failed";
  return (
    <div className={`run-diagnostics__source ${failed ? "run-diagnostics__source--failed" : ""}`}>
      <span className="run-diagnostics__source-icon">{sourceIcon(health.source)}</span>
      <div>
        <strong>{sourceName(health.source)}</strong>
        <span>{result ? `${result.count} retrieved${result.duplicatesRemoved ? ` · ${result.duplicatesRemoved} duplicate${result.duplicatesRemoved === 1 ? "" : "s"}` : ""}` : "Not included in a recorded run"}</span>
        {result?.message ? <small>{result.message}</small> : null}
      </div>
      <div className="run-diagnostics__source-meta">
        <Badge>{failed ? result?.timedOut ? "Timed out" : "Failed" : result ? "Completed" : "No result"}</Badge>
        {result ? <small>{durationLabel(result.durationMs ?? 0)}{(result.attempts ?? 1) > 1 ? ` · ${result.attempts} attempts` : ""}</small> : null}
        <small>{health.lastSuccessfulAt ? `Last success ${relativeDate(health.lastSuccessfulAt)}` : "No successful run"}</small>
      </div>
    </div>
  );
}

function healthLabel(status: ReturnType<typeof runHealthStatus>) {
  if (status === "healthy") return "All sources completed";
  if (status === "partial") return "Completed with source issues";
  if (status === "failed") return "Collection failed";
  return "No runs recorded";
}

function sourceName(source: RadarSource) {
  if (source === "rss") return "RSS & Atom";
  if (source === "manual") return "Manual URLs";
  if (source === "youtube") return "YouTube";
  return source;
}

function sourceIcon(source: RadarSource) {
  if (source === "rss") return <Rss size={16} />;
  if (source === "manual") return <Link2 size={16} />;
  if (source === "youtube") return <Youtube size={16} />;
  return <Activity size={16} />;
}

function durationLabel(milliseconds: number) {
  if (!milliseconds) return "<1s";
  if (milliseconds < 1_000) return `${milliseconds}ms`;
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`;
}

function relativeDate(value: string) {
  const difference = Date.now() - new Date(value).getTime();
  if (difference < 60_000) return "just now";
  if (difference < 3_600_000) return `${Math.max(1, Math.floor(difference / 60_000))}m ago`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)}h ago`;
  return formatDate(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
