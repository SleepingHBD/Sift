"use client";

import { ExternalLink, FileText, X } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { relationshipLabel } from "@/lib/strategy-pipeline/model";
import type { StrategyPieceSourceRecord, StrategyStageSourceRecord, StrategyTurnSourceRecord } from "@/lib/strategy-pipeline/types";

export function StrategySourceDrawer({ source, onClose }: { source: StrategyStageSourceRecord | StrategyPieceSourceRecord | StrategyTurnSourceRecord | null; onClose: () => void }) {
  if (!source) return null;
  return (
    <div className="insight-source-drawer" role="dialog" aria-modal="true" aria-labelledby="insight-source-title">
      <button className="insight-source-drawer__scrim" aria-label="Close source detail" onClick={onClose} />
      <aside>
        <header>
          <div><span><FileText size={18} /></span><div><p className="eyebrow">Original evidence</p><h2 id="insight-source-title">{source.source.title}</h2></div></div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="insight-source-drawer__body">
          <div className="insight-source-drawer__badges"><Badge>{source.source.kind}</Badge><Badge>{relationshipLabel(source.relationship)}</Badge></div>
          <dl>
            <div><dt>Source</dt><dd>{source.source.sourceLabel}</dd></div>
            {source.source.author ? <div><dt>Author</dt><dd>{source.source.author}</dd></div> : null}
            <div><dt>Captured</dt><dd>{new Date(source.source.capturedAt).toLocaleDateString()}</dd></div>
          </dl>
          <section><p className="eyebrow">Preserved excerpt</p><p>{source.excerpt || source.source.excerpt || "No source excerpt was available."}</p></section>
          {source.rationale ? <section><p className="eyebrow">Why it is linked</p><p>{source.rationale}</p></section> : null}
          {source.source.originalUrl ? <Button variant="dark" onClick={() => window.open(source.source.originalUrl!, "_blank", "noopener,noreferrer")}><ExternalLink size={15} /> Open original</Button> : <p className="insight-source-drawer__notice">This saved source does not have an external URL.</p>}
        </div>
      </aside>
    </div>
  );
}
