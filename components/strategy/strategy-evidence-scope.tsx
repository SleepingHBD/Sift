import { BookOpenText, ExternalLink, FileSearch, MessageSquareText, Sparkles } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import type { StrategyEvidencePreview } from "@/lib/strategy-ai/types";

const kindLabels = {
  mention: "Radar",
  research: "Research",
  inspiration: "Inspiration",
};

export function StrategyEvidenceScope({
  preview,
  selected,
  onToggle,
}: {
  preview: StrategyEvidencePreview | null;
  selected: Set<string>;
  onToggle: (identity: string) => void;
}) {
  if (!preview) {
    return (
      <aside className="strategy-scope strategy-scope--empty">
        <FileSearch size={22} />
        <p className="eyebrow">Evidence scope</p>
        <h2>See the sources before Sift thinks with them.</h2>
        <p>Enter one question and Sift will retrieve only evidence your signed-in account can access inside the chosen project.</p>
        <div className="strategy-scope__guardrail"><Sparkles size={15} /><span>No AI conclusion is generated during this preview.</span></div>
      </aside>
    );
  }

  return (
    <aside className="strategy-scope">
      <div className="strategy-scope__head">
        <div><p className="eyebrow">Evidence scope</p><h2>{selected.size} of {preview.evidence.length} sources selected</h2></div>
        <Badge>{preview.coverage.totalEvidence} in project</Badge>
      </div>
      <p className="strategy-scope__search">Sift searched: <strong>{preview.searchText}</strong></p>
      {preview.evidence.length ? (
        <div className="strategy-scope__list">
          {preview.evidence.map((item, index) => (
            <article className={`strategy-source ${selected.has(item.identity) ? "strategy-source--selected" : ""}`} key={item.identity}>
              <label>
                <input type="checkbox" checked={selected.has(item.identity)} onChange={() => onToggle(item.identity)} />
                <span className="strategy-source__number">{String(index + 1).padStart(2, "0")}</span>
                <span className="strategy-source__body">
                  <span className="strategy-source__meta"><b>{kindLabels[item.kind]}</b><span>{item.sourceLabel}</span></span>
                  <strong>{item.title}</strong>
                  <span>{item.sourceExcerpt || item.initialInterpretation || "Source saved without a text excerpt."}</span>
                </span>
              </label>
              {item.originalUrl ? <a href={item.originalUrl} target="_blank" rel="noreferrer">Open original <ExternalLink size={12} /></a> : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="strategy-scope__no-match"><BookOpenText size={20} /><strong>No eligible evidence matched.</strong><span>Try a broader question or add more material to this project.</span></div>
      )}
      <div className="strategy-scope__footer">
        <div><MessageSquareText size={15} /><span>Irrelevant and archived sources are excluded automatically.</span></div>
        <Button disabled title="Model generation will be connected in the next Phase 6 increment">Analysis not connected yet</Button>
      </div>
    </aside>
  );
}
