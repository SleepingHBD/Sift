"use client";

import { AlertTriangle, BarChart3, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { SIGNAL_ASSESSMENT_DISCLAIMER } from "@/lib/signals/assessment";
import type { SignalSnapshotRecord } from "@/lib/signals/types";

const factorLabels: Record<string, string> = {
  evidenceVolume: "Supporting evidence",
  sourceDiversity: "Source diversity",
  authorDiversity: "Author diversity",
  recentGrowth: "Recent growth",
  recency: "Evidence recency",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

interface SignalAssessmentPanelProps {
  snapshots: SignalSnapshotRecord[];
  evidenceCount: number;
  pending: boolean;
  readOnly?: boolean;
  onCreate: () => void;
}

export function SignalAssessmentPanel({ snapshots, evidenceCount, pending, readOnly = false, onCreate }: SignalAssessmentPanelProps) {
  const latest = snapshots[0];
  return (
    <section className="signal-detail__section signal-assessment" aria-labelledby="signal-assessment-heading">
      <div className="signal-detail__section-heading">
        <div><p className="drawer-section-label" id="signal-assessment-heading">Directional assessment</p><span>Transparent, versioned, and based only on linked project evidence.</span></div>
        {!readOnly ? <Button size="sm" variant="dark" disabled={pending || evidenceCount === 0} onClick={onCreate}>
          {pending ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
          {latest ? "Reassess" : "Create assessment"}
        </Button> : <Badge>Assessment locked</Badge>}
      </div>
      {!evidenceCount ? <div className="signal-assessment__empty"><AlertTriangle size={17} /><span>Link at least one source before assessing this signal.</span></div> : null}
      {latest ? <>
        <div className="signal-assessment__hero">
          <div><span>Directional strength</span><strong>{latest.strengthScore}<small>/100</small></strong></div>
          <div><span>Evidence sufficiency</span><Badge>{latest.evidenceSufficiency}</Badge></div>
          <div><span>Movement</span><Badge>{latest.movement}</Badge></div>
          <div><span>Version</span><strong>{latest.analysisVersion}</strong></div>
        </div>
        <p className="signal-assessment__disclaimer"><AlertTriangle size={14} />{SIGNAL_ASSESSMENT_DISCLAIMER}</p>
        <div className="signal-assessment__factors">
          {Object.entries(latest.factors).map(([key, factor]) => <div key={key}>
            <span>{factorLabels[key] ?? key}</span>
            <strong>{factor.available ? factor.value : "Unavailable"}</strong>
            <small>{factor.available ? `${Math.round(factor.normalized ?? 0)}/100 normalized · ${Math.round(factor.weight * 100)}% weight` : "Excluded from this score"}</small>
          </div>)}
        </div>
        <div className="signal-assessment__guidance">
          <div><strong>Limitations</strong>{latest.limitations.length ? <ul>{latest.limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No additional limitations recorded.</p>}</div>
          <div><strong>Research gaps</strong>{latest.researchGaps.length ? <ul>{latest.researchGaps.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No research gaps recorded.</p>}</div>
        </div>
      </> : null}
      {snapshots.length ? <details className="signal-assessment__history"><summary>Assessment history ({snapshots.length})</summary><ol>{snapshots.map((snapshot, index) => <li key={snapshot.id}><span>{index === 0 ? <CheckCircle2 size={13} /> : <BarChart3 size={13} />}<strong>{snapshot.strengthScore}/100</strong> · {snapshot.evidenceSufficiency} · {snapshot.movement}</span><time>{formatDate(snapshot.createdAt)}</time></li>)}</ol></details> : null}
    </section>
  );
}
