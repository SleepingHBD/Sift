import { BookOpenText, ClipboardList, ExternalLink, FileSearch, MessageSquareText, Sparkles } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import type { StrategyEvidencePreview } from "@/lib/strategy-ai/types";

const kindLabels = {
  mention: "Radar",
  research: "Research",
  inspiration: "Inspiration",
};

const retrievalLabels = {
  strong: "Strong match",
  partial: "Partial match",
  project_context: "Project context",
};

export function StrategyEvidenceScope({
  preview,
  selected,
  onToggle,
  onPrepareHandoff,
}: {
  preview: StrategyEvidencePreview | null;
  selected: Set<string>;
  onToggle: (identity: string) => void;
  onPrepareHandoff: () => void;
}) {
  if (!preview) {
    return (
      <aside className="strategy-scope strategy-scope--empty">
        <FileSearch size={22} />
        <p className="eyebrow">Evidence scope</p>
        <h2>See the sources before ChatGPT sees them.</h2>
        <p>Enter one question and Sift will retrieve only evidence your signed-in account can access inside the chosen project.</p>
        <div className="strategy-scope__guardrail"><Sparkles size={15} /><span>Nothing is sent automatically. You decide what to copy.</span></div>
      </aside>
    );
  }

  const matchedEvidence = preview.evidence.filter((item) => item.retrievalTier !== "project_context");
  const contextualEvidence = preview.evidence.filter((item) => item.retrievalTier === "project_context");
  const groups = [
    { id: "matches", title: "Relevant matches", description: "Automatically ranked from your natural-language question.", items: matchedEvidence },
    { id: "context", title: "Other project evidence", description: "No direct text match. These sources remain unselected until you decide they belong.", items: contextualEvidence },
  ].filter((group) => group.items.length);

  return (
    <aside className="strategy-scope">
      <div className="strategy-scope__head">
        <div><p className="eyebrow">Evidence scope</p><h2>{selected.size} of {preview.evidence.length} sources selected</h2></div>
        <Badge>{preview.coverage.totalEvidence} in project</Badge>
      </div>
      <p className="strategy-scope__search">Concepts Sift considered: <strong>{preview.searchText || "No distinctive terms detected"}</strong></p>
      {preview.evidence.length ? (
        <div className="strategy-scope__list">
          {groups.map((group) => <section className="strategy-scope__group" key={group.id}>
            <header><div><strong>{group.title}</strong><span>{group.description}</span></div><Badge>{group.items.length}</Badge></header>
            {group.items.map((item) => {
              const index = preview.evidence.findIndex((candidate) => candidate.identity === item.identity);
              const tier = item.retrievalTier || "partial";
              return <article id={`strategy-source-${encodeURIComponent(item.identity)}`} className={`strategy-source strategy-source--${tier} ${selected.has(item.identity) ? "strategy-source--selected" : ""}`} key={item.identity}>
                <label>
                  <input type="checkbox" checked={selected.has(item.identity)} onChange={() => onToggle(item.identity)} />
                  <span className="strategy-source__number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="strategy-source__body">
                    <span className="strategy-source__meta"><b>{kindLabels[item.kind]}</b><span>{item.sourceLabel}</span><em>{retrievalLabels[tier]}</em></span>
                    <strong>{item.title}</strong>
                    <span>{item.sourceExcerpt || item.initialInterpretation || "Source saved without a text excerpt."}</span>
                    <small>{item.matchedTerms?.length ? `Matched: ${item.matchedTerms.join(", ")}` : tier === "project_context" ? "Shown because it belongs to this project; no textual relevance is assumed." : "Matched through saved tags, topics, or source metadata."}</small>
                  </span>
                </label>
                {item.originalUrl ? <a href={item.originalUrl} target="_blank" rel="noreferrer">Open original <ExternalLink size={12} /></a> : null}
              </article>;
            })}
          </section>)}
        </div>
      ) : (
        <div className="strategy-scope__no-match"><BookOpenText size={20} /><strong>No eligible evidence is available.</strong><span>Add evidence to this project, or review sources currently marked irrelevant or archived.</span></div>
      )}
      <div className="strategy-scope__footer">
        <div><MessageSquareText size={15} /><span>Irrelevant and archived sources are excluded automatically.</span></div>
        <Button
          variant="dark"
          disabled={!selected.size}
          title={!selected.size ? "Select at least one source" : "Prepare a visible prompt from this exact evidence scope"}
          onClick={onPrepareHandoff}
        >
          <ClipboardList size={15} />Prepare ChatGPT handoff
        </Button>
      </div>
    </aside>
  );
}
