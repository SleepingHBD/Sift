"use client";

import { AlertCircle, Check, ChevronDown, CircleDashed, CircleOff, Link2, Rss, Youtube } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { buildMonitorCoverage, type MonitorCoverageStatus } from "@/lib/radar/coverage";
import type { RadarConnectorSettings } from "@/lib/radar/connector-service";
import type { RadarSource } from "@/lib/radar/types";

export function MonitorCoveragePreview({
  selectedSources,
  settings,
  backendConfigured,
  onManageSources,
  collapsible = false,
}: {
  selectedSources: RadarSource[];
  settings: RadarConnectorSettings;
  backendConfigured: boolean;
  onManageSources?: () => void;
  collapsible?: boolean;
}) {
  const report = buildMonitorCoverage(selectedSources, settings, backendConfigured);
  const content = (
    <div className="monitor-coverage__content">
      <div className="monitor-coverage__intro">
        <p>{report.explicitSelection
          ? "Only explicitly included sources are eligible for this monitor."
          : "No source restriction is set. Radar will use every configured, permitted source."}</p>
        {onManageSources ? <Button type="button" onClick={onManageSources}>Manage source connections</Button> : null}
      </div>
      <div className="monitor-coverage__list">
        {report.sources.map((source) => (
          <div className={`monitor-coverage__row monitor-coverage__row--${source.status}`} key={source.source}>
            <span className="monitor-coverage__icon">{sourceIcon(source.source)}</span>
            <div className="monitor-coverage__copy">
              <strong>{source.name}</strong>
              <span>{source.collectionMethod}</span>
              <small>{source.configuration}{source.capabilities.length ? ` · Retrieves ${source.capabilities.join(", ").toLowerCase()}` : ""}</small>
            </div>
            <Badge>{statusLabel(source.status)}</Badge>
          </div>
        ))}
      </div>
      <p className="monitor-coverage__note">Coverage describes only the sources Sift can actually observe. It is not a claim about the whole market or internet.</p>
    </div>
  );

  if (!collapsible) {
    return (
      <section className="monitor-coverage monitor-coverage--preview">
        <CoverageHeading runnableCount={report.runnableCount} attentionCount={report.attentionCount} />
        {content}
      </section>
    );
  }

  return (
    <details className="monitor-coverage monitor-coverage--compact">
      <summary>
        <CoverageHeading runnableCount={report.runnableCount} attentionCount={report.attentionCount} />
        <ChevronDown size={16} />
      </summary>
      {content}
    </details>
  );
}

function CoverageHeading({ runnableCount, attentionCount }: { runnableCount: number; attentionCount: number }) {
  return (
    <div className="monitor-coverage__heading">
      <span>Source coverage</span>
      <strong>{runnableCount
        ? `${runnableCount} source${runnableCount === 1 ? "" : "s"} ready`
        : "No sources ready"}</strong>
      {attentionCount ? <small>{attentionCount} selected source{attentionCount === 1 ? " needs" : "s need"} attention</small> : <small>Expand to see what Radar can retrieve</small>}
    </div>
  );
}

function sourceIcon(source: RadarSource) {
  if (source === "youtube") return <Youtube size={17} />;
  if (source === "rss") return <Rss size={17} />;
  if (source === "manual") return <Link2 size={17} />;
  return <CircleDashed size={17} />;
}

function statusLabel(status: MonitorCoverageStatus) {
  if (status === "ready") return <><Check size={11} />Ready</>;
  if (status === "needs-configuration") return <><AlertCircle size={11} />Needs setup</>;
  if (status === "backend-unavailable") return <><AlertCircle size={11} />Backend setup</>;
  if (status === "not-included") return <><CircleOff size={11} />Not included</>;
  return <><CircleDashed size={11} />Unavailable</>;
}
