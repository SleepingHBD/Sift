"use client";

import { ArrowUpRight, BarChart3, FlaskConical, X } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import type { RadarMention, SpikeInsight } from "@/lib/radar/types";
import { formatNumber } from "@/lib/utils";

interface SpikeDrawerProps {
  spike: SpikeInsight | null;
  mentions: RadarMention[];
  supportingStatus?: "idle" | "loading" | "error";
  supportingError?: string;
  onClose: () => void;
  onOpenMention: (mention: RadarMention) => void;
}

export function SpikeDrawer({ spike, mentions, supportingStatus, supportingError, onClose, onOpenMention }: SpikeDrawerProps) {
  if (!spike) return null;
  const topMentions = spike.topMentionIds.map((id) => mentions.find((mention) => mention.id === id)).filter((mention): mention is RadarMention => Boolean(mention));
  const missingMentions = Math.max(0, spike.topMentionIds.length - topMentions.length);
  return (
    <div className="radar-overlay radar-overlay--drawer" role="dialog" aria-modal="true" aria-labelledby="spike-drawer-title">
      <button className="radar-overlay__scrim" onClick={onClose} aria-label="Close spike detail" />
      <aside className="radar-drawer spike-drawer">
        <header><div><p className="eyebrow">Conversation spike</p><h2 id="spike-drawer-title">{spike.label}</h2><p>Measured against the recent volume baseline.</p></div><button onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="spike-drawer__hero"><div><span>Measured increase</span><strong>+{spike.growth}%</strong><small>{spike.mentions} mentions · baseline {spike.baseline}</small></div><span className="spike-drawer__icon"><BarChart3 size={25} /></span></div>
        <section><span className="drawer-section-label">What increased?</span><div className="spike-breakdown-grid"><div><span>Topics</span>{spike.topTopics.map((topic) => <p key={topic.name}><strong>{topic.name}</strong><b>{topic.mentions}</b></p>)}</div><div><span>Sources</span>{spike.topSources.map((source) => <p key={source.name}><strong>{source.name}</strong><b>{source.mentions}</b></p>)}</div></div></section>
        <section><span className="drawer-section-label">Unusually frequent keywords</span><div className="keyword-cloud">{spike.unusualKeywords.map((keyword) => <Badge key={keyword}>{keyword}</Badge>)}</div></section>
        <section className="likely-drivers"><div><span className="drawer-section-label">Likely drivers</span></div>{spike.likelyDrivers.length ? spike.likelyDrivers.map((driver) => <div key={driver.explanation}><FlaskConical size={16} /><div><Badge>Interpretation</Badge><p>{driver.explanation}</p><span>Supported by {driver.mentionIds.length} linked mentions below.</span></div></div>) : <div className="no-driver"><FlaskConical size={17} /><div><strong>No clear driver identified.</strong><p>Volume increased, but no single topic has enough supporting evidence to explain the spike.</p></div></div>}</section>
        <section className="spike-top-mentions">
          <span className="drawer-section-label">Highest-engagement mentions</span>
          {topMentions.map((mention) => <button key={mention.id} onClick={() => onOpenMention(mention)}><div><strong>{mention.author}</strong></div><p>{mention.content}</p><span>{mention.topics[0]} · {formatNumber(mention.engagement)} engagement <ArrowUpRight size={12} /></span></button>)}
          {supportingStatus === "loading" && missingMentions ? <p>Loading {missingMentions} supporting record{missingMentions === 1 ? "" : "s"} from complete history...</p> : null}
          {supportingStatus === "error" && missingMentions ? <p>{supportingError || "Supporting records could not be loaded."}</p> : null}
          {supportingStatus === "idle" && missingMentions ? <p>{missingMentions} supporting record{missingMentions === 1 ? " is" : "s are"} unavailable.</p> : null}
        </section>
        <footer><Button onClick={onClose}>Back to Radar</Button></footer>
      </aside>
    </div>
  );
}
