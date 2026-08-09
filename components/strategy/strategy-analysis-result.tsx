import { AlertTriangle, ArrowUpRight, BookOpenCheck, CircleHelp, Lightbulb, Scale, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import type { StrategyAnalysisResult, StrategyClaimClassification } from "@/lib/strategy-ai/types";

const classificationLabels: Record<StrategyClaimClassification, string> = {
  measured_fact: "Measured fact",
  interpretation: "Interpretation",
  hypothesis: "Hypothesis",
  recommendation: "Recommendation",
};

export function StrategyAnalysisPanel({ result }: { result: StrategyAnalysisResult }) {
  const sourceNumber = new Map(result.sources.map((source, index) => [source.identity, index + 1]));

  return (
    <section className="strategy-analysis" aria-labelledby="strategy-analysis-heading">
      <header className="strategy-analysis__head">
        <span className="ai-orb"><BookOpenCheck size={18} /></span>
        <div>
          <Badge>Workspace-backed analysis</Badge>
          <h2 id="strategy-analysis-heading">Evidence before conclusion.</h2>
          <p>Every claim below is labelled by what kind of thinking it represents and linked to the exact selected source.</p>
        </div>
        <span className="strategy-analysis__model">{result.model}</span>
      </header>

      <div className="strategy-analysis__summary">
        <p className="eyebrow">Strategist response</p>
        <p>{result.analysis.summary}</p>
      </div>

      {result.analysis.claims.length ? (
        <div className="strategy-analysis__claims">
          {result.analysis.claims.map((claim) => (
            <article className={`strategy-claim strategy-claim--${claim.classification}`} key={claim.id}>
              <div className="strategy-claim__meta"><Badge>{classificationLabels[claim.classification]}</Badge><span>{claim.confidence} confidence</span></div>
              <h3>{claim.statement}</h3>
              <p><strong>Why it may matter</strong>{claim.whyItMatters}</p>
              {claim.caveat ? <p className="strategy-claim__caveat"><AlertTriangle size={14} /><span>{claim.caveat}</span></p> : null}
              <div className="strategy-citations" aria-label={`Sources for ${claim.id}`}>
                {claim.evidenceIds.map((identity) => <CitationLink identity={identity} number={sourceNumber.get(identity)} key={identity} />)}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="strategy-analysis__insufficient"><ShieldCheck size={19} /><strong>No supported claim was produced.</strong><span>Sift kept the response at the evidence-gap level instead of inventing a finding.</span></div>
      )}

      {result.analysis.tensions.length ? (
        <section className="strategy-analysis__tensions">
          <div className="strategy-analysis__section-title"><Scale size={17} /><div><p className="eyebrow">Tensions and contradictions</p><h3>What does not resolve neatly</h3></div></div>
          {result.analysis.tensions.map((tension, index) => (
            <article key={`${tension.description}-${index}`}>
              <strong>{tension.description}</strong>
              <p>{tension.implication}</p>
              <div className="strategy-citations">{tension.evidenceIds.map((identity) => <CitationLink identity={identity} number={sourceNumber.get(identity)} key={identity} />)}</div>
            </article>
          ))}
        </section>
      ) : null}

      <div className="strategy-analysis__followups">
        <AnalysisList icon={CircleHelp} eyebrow="Evidence gaps" title="What Sift still cannot know" items={result.analysis.evidenceGaps} empty="No explicit gap returned." />
        <AnalysisList icon={Lightbulb} eyebrow="Next questions" title="Where to investigate next" items={result.analysis.nextQuestions} empty="No follow-up question returned." />
        <AnalysisList icon={AlertTriangle} eyebrow="Limitations" title="How to read this answer" items={result.analysis.limitations} empty="No additional limitation returned." />
      </div>
    </section>
  );
}

function CitationLink({ identity, number }: { identity: string; number?: number }) {
  return <a href={`#strategy-source-${encodeURIComponent(identity)}`} title={`Inspect ${identity}`}>[{number ?? "?"}] <ArrowUpRight size={11} /></a>;
}

function AnalysisList({ icon: Icon, eyebrow, title, items, empty }: { icon: typeof CircleHelp; eyebrow: string; title: string; items: string[]; empty: string }) {
  return (
    <section>
      <div className="strategy-analysis__section-title"><Icon size={16} /><div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div></div>
      {items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}
    </section>
  );
}
