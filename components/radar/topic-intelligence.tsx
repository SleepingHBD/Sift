"use client";

import { ArrowRight, MessageCircle, TrendingUp, X } from "lucide-react";
import { Badge, Button, Card, SectionHeader } from "@/components/ui/primitives";
import type { RadarMention, TopicIntelligence as TopicIntelligenceType } from "@/lib/radar/types";
import { formatNumber } from "@/lib/utils";

export function TopicIntelligence({ topics, mentions, activeTopic, onSelect, onOpenMention, onInspectMentions }: { topics: TopicIntelligenceType[]; mentions: RadarMention[]; activeTopic: string; onSelect: (topic: string) => void; onOpenMention: (mention: RadarMention) => void; onInspectMentions: () => void }) {
  const selected = topics.find((topic) => topic.name === activeTopic);
  const fastest = [...topics].sort((a, b) => b.growth - a.growth).slice(0, 4);
  const examples = selected ? selected.exampleMentionIds.map((id) => mentions.find((mention) => mention.id === id)).filter((mention): mention is RadarMention => Boolean(mention)) : [];
  return (
    <section className="radar-section topic-intelligence-section">
      <SectionHeader eyebrow="Topic intelligence" title="What is driving the conversation?" description="Related mentions are grouped deterministically from their language and assigned topic rules." />
      <div className="topic-intelligence-layout">
        <Card className="topic-table-card">
          <div className="topic-table__head"><span>Topic</span><span>Mentions</span><span>Growth</span><span>Sentiment</span><span>Engagement</span><span>Authors</span><span>Top source</span></div>
          {topics.slice(0, 8).map((topic) => <button key={topic.id} className={activeTopic === topic.name ? "active" : ""} onClick={() => onSelect(activeTopic === topic.name ? "" : topic.name)}><span><i />{topic.name}</span><strong>{topic.mentions}</strong><b className={topic.growth >= 0 ? "positive" : "negative"}>{topic.growth >= 0 ? "+" : ""}{topic.growth}%</b><span>{topic.sentiment >= 0 ? "+" : ""}{topic.sentiment}</span><span>{formatNumber(topic.engagement)}</span><span>{topic.uniqueAuthors}</span><span>{topic.topSource}<ArrowRight size={13} /></span></button>)}
        </Card>
        <Card className="fastest-topics"><div><TrendingUp size={17} /><div><p className="eyebrow">Fastest growing</p><h3>Topics gaining momentum</h3></div></div>{fastest.map((topic, index) => <button key={topic.id} onClick={() => onSelect(topic.name)}><span>0{index + 1}</span><div><strong>{topic.name}</strong><small>{topic.mentions} mentions</small></div><b>+{topic.growth}%</b></button>)}</Card>
      </div>
      {selected ? <Card className="topic-focus-panel"><div className="topic-focus-panel__head"><div><Badge>Topic selected</Badge><h3>{selected.name}</h3><p>Inspect the signal here, then move to the filtered conversation.</p></div><div><Button onClick={() => onSelect("")}><X size={14} />Clear</Button><Button variant="dark" onClick={onInspectMentions}>View mentions<ArrowRight size={13} /></Button></div></div><div className="topic-focus-metrics"><span>Mentions<strong>{selected.mentions}</strong></span><span>Growth<strong>{selected.growth >= 0 ? "+" : ""}{selected.growth}%</strong></span><span>Sentiment<strong>{selected.sentiment >= 0 ? "+" : ""}{selected.sentiment}</strong></span><span>Engagement<strong>{formatNumber(selected.engagement)}</strong></span></div><div className="topic-examples"><span>Example mentions</span>{examples.map((mention) => <button key={mention.id} onClick={() => onOpenMention(mention)}><MessageCircle size={14} /><div><strong>{mention.author}</strong><p>{mention.content}</p></div></button>)}</div></Card> : null}
    </section>
  );
}
