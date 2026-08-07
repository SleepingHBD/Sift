"use client";

import { ArrowRight, Eye, FlaskConical, Lightbulb } from "lucide-react";
import { Badge, Card, SectionHeader } from "@/components/ui/primitives";
import type { RadarMention, StrategistObservation } from "@/lib/radar/types";

export function StrategistPanel({ observations, mentions, onOpenMention }: { observations: StrategistObservation[]; mentions: RadarMention[]; onOpenMention: (mention: RadarMention) => void }) {
  return (
    <section className="radar-section strategist-attention">
      <SectionHeader eyebrow="Strategist read" title="What should I pay attention to?" description="Deterministic observations from measured data. Interpretations and hypotheses are labeled separately." />
      <div className="strategist-observation-list">
        {observations.slice(0, 3).map((observation, index) => {
          const sources = observation.supportingMentionIds.map((id) => mentions.find((mention) => mention.id === id)).filter((mention): mention is RadarMention => Boolean(mention));
          return <Card className="strategist-observation" key={observation.id}><span className="strategist-observation__index">0{index + 1}</span><div className="strategist-observation__main"><div><Badge className="claim-badge claim-badge--fact">Measured</Badge><Badge>{observation.confidence} confidence</Badge></div><h3>{observation.observation}</h3><ul>{observation.measuredEvidence.map((item) => <li key={item}>{item}</li>)}</ul><details><summary>Open strategist interpretation <ArrowRight size={12} /></summary><div className="strategist-claims"><div><span><Eye size={13} />Interpretation</span><p>{observation.interpretation}</p></div>{observation.hypothesis ? <div><span><FlaskConical size={13} />Hypothesis</span><p>{observation.hypothesis}</p></div> : null}<div><span><Lightbulb size={13} />Why it may matter</span><p>{observation.whyItMatters}</p></div></div><div className="strategist-support"><span>Supporting mentions</span>{sources.map((mention, sourceIndex) => <button key={mention.id} onClick={() => onOpenMention(mention)}><b>[{sourceIndex + 1}]</b><span>{mention.author} · {mention.content.slice(0, 76)}…</span><ArrowRight size={12} /></button>)}</div></details></div></Card>;
        })}
      </div>
    </section>
  );
}
