import { AlertTriangle, ArrowUpRight, BookOpenCheck, CircleHelp, Lightbulb, Scale, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import type { StrategyAnalysisResult, StrategyClaim, StrategyClaimClassification } from "@/lib/strategy-ai/types";

const classificationContent: Record<StrategyClaimClassification, { label: string; explanation: string }> = {
  measured_fact: { label: "Measured fact", explanation: "Directly supported by the selected evidence." },
  interpretation: { label: "Interpretation", explanation: "A reasoned reading of the evidence, not a proven fact." },
  hypothesis: { label: "Hypothesis", explanation: "A possible explanation that still needs testing." },
  recommendation: { label: "Recommendation", explanation: "An action to consider, not something the evidence proves." },
};

const claimGroups: Array<{
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  classifications: StrategyClaimClassification[];
}> = [
  {
    id: "supported",
    eyebrow: "What the evidence shows",
    title: "What is directly supported",
    description: "These points come directly from the sources you selected.",
    classifications: ["measured_fact"],
  },
  {
    id: "meaning",
    eyebrow: "What it may mean",
    title: "The most useful interpretation",
    description: "These are reasoned readings and possibilities. They should not be treated as proven facts.",
    classifications: ["interpretation", "hypothesis"],
  },
  {
    id: "action",
    eyebrow: "What you could do",
    title: "Possible strategic moves",
    description: "These are actions to consider and validate, based on the selected evidence.",
    classifications: ["recommendation"],
  },
];

export function StrategyAnalysisPanel({ result }: { result: StrategyAnalysisResult }) {
  const sourceNumber = new Map(result.sources.map((source, index) => [source.identity, index + 1]));
  const importedFromChatGpt = result.origin === "chatgpt_manual";
  const visibleClaimGroups = claimGroups
    .map((group) => ({
      ...group,
      claims: result.analysis.claims.filter((claim) => group.classifications.includes(claim.classification)),
    }))
    .filter((group) => group.claims.length);

  return (
    <section className="strategy-analysis" aria-labelledby="strategy-analysis-heading">
      <header className="strategy-analysis__head">
        <span className="ai-orb"><BookOpenCheck size={18} /></span>
        <div>
          <Badge>{importedFromChatGpt ? "ChatGPT response · citations checked" : "Workspace-backed analysis"}</Badge>
          <h2 id="strategy-analysis-heading">Here is the clearest answer.</h2>
          <p>Start with the answer, then inspect what supports it, what it may mean, and what still needs checking.</p>
        </div>
        <span className="strategy-analysis__model" title={`Response provenance: ${result.model}`}><ShieldCheck size={12} />Citations checked</span>
      </header>

      <div className="strategy-analysis__summary">
        <p className="eyebrow">Straight answer</p>
        <p>{result.analysis.summary}</p>
      </div>

      {result.analysis.claims.length ? visibleClaimGroups.map((group) => (
        <section className="strategy-analysis__claim-group" key={group.id}>
          <div className="strategy-analysis__claim-group-head">
            <p className="eyebrow">{group.eyebrow}</p>
            <h3>{group.title}</h3>
            <p>{group.description}</p>
          </div>
          <div className="strategy-analysis__claims">
            {group.claims.map((claim) => <ClaimCard claim={claim} sourceNumber={sourceNumber} key={claim.id} />)}
          </div>
        </section>
      )) : (
        <div className="strategy-analysis__insufficient"><ShieldCheck size={19} /><strong>There is not enough evidence for a dependable answer yet.</strong><span>Sift has shown what is missing instead of inventing a conclusion.</span></div>
      )}

      {result.analysis.tensions.length ? (
        <section className="strategy-analysis__tensions">
          <div className="strategy-analysis__section-title"><Scale size={17} /><div><p className="eyebrow">What feels unresolved</p><h3>The tension to pay attention to</h3></div></div>
          {result.analysis.tensions.map((tension, index) => (
            <article key={`${tension.description}-${index}`}>
              <strong>{tension.description}</strong>
              <p>{tension.implication}</p>
              <div className="strategy-citations">
                <span className="strategy-citations__label">Evidence</span>
                {tension.evidenceIds.map((identity) => <CitationLink identity={identity} number={sourceNumber.get(identity)} key={identity} />)}
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <div className="strategy-analysis__followups">
        <AnalysisList icon={Lightbulb} eyebrow="Next move" title="What to investigate next" items={result.analysis.nextQuestions} empty="No follow-up question was suggested." />
        <AnalysisList icon={CircleHelp} eyebrow="What is missing" title="What we still do not know" items={result.analysis.evidenceGaps} empty="No specific evidence gap was returned." />
        <AnalysisList icon={AlertTriangle} eyebrow="Keep in perspective" title="Why not to overgeneralize" items={result.analysis.limitations} empty="No additional limitation was returned." />
      </div>
    </section>
  );
}

function ClaimCard({ claim, sourceNumber }: { claim: StrategyClaim; sourceNumber: Map<string, number> }) {
  const content = classificationContent[claim.classification];
  return (
    <article className={`strategy-claim strategy-claim--${claim.classification}`}>
      <div className="strategy-claim__meta"><Badge>{content.label}</Badge><span>{claim.confidence} confidence</span></div>
      <p className="strategy-claim__explanation">{content.explanation}</p>
      <h3>{claim.statement}</h3>
      <p><strong>Why this matters</strong>{claim.whyItMatters}</p>
      {claim.caveat ? <p className="strategy-claim__caveat"><AlertTriangle size={14} /><span><strong>Keep in mind</strong>{claim.caveat}</span></p> : null}
      <div className="strategy-citations" aria-label={`Evidence for ${claim.id}`}>
        <span className="strategy-citations__label">Evidence</span>
        {claim.evidenceIds.map((identity) => <CitationLink identity={identity} number={sourceNumber.get(identity)} key={identity} />)}
      </div>
    </article>
  );
}

function CitationLink({ identity, number }: { identity: string; number?: number }) {
  return <a href={`#strategy-source-${encodeURIComponent(identity)}`} title={`Inspect ${identity}`}>Source {number ?? "?"} <ArrowUpRight size={11} /></a>;
}

function AnalysisList({ icon: Icon, eyebrow, title, items, empty }: { icon: typeof CircleHelp; eyebrow: string; title: string; items: string[]; empty: string }) {
  return (
    <section>
      <div className="strategy-analysis__section-title"><Icon size={16} /><div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div></div>
      {items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}
    </section>
  );
}
