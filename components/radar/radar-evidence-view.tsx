"use client";

import { ArrowRight, Bookmark, Flag, Link2, Library } from "lucide-react";
import { Badge, Button, SectionHeader } from "@/components/ui/primitives";
import type { RadarEvidenceLink, RadarMention } from "@/lib/radar/types";
import { formatNumber } from "@/lib/utils";

export function RadarEvidenceView({
  mentions,
  savedIds,
  importantIds,
  links,
  onOpenMention,
  onUseEvidence,
}: {
  mentions: RadarMention[];
  savedIds: string[];
  importantIds: string[];
  links: RadarEvidenceLink[];
  onOpenMention: (mention: RadarMention) => void;
  onUseEvidence: (mention: RadarMention) => void;
}) {
  const evidenceMentions = mentions
    .filter((mention) => savedIds.includes(mention.id) || importantIds.includes(mention.id) || links.some((link) => link.mentionId === mention.id))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const linkedIds = new Set(links.map((link) => link.mentionId));
  const destinations = [...new Set(links.map((link) => link.destinationLabel))].map((label) => ({
    label,
    count: links.filter((link) => link.destinationLabel === label).length,
  }));

  return (
    <section className="radar-evidence-view">
      <SectionHeader
        eyebrow="Evidence workspace"
        title="Signals worth carrying forward"
        description="Saved, important, and linked conversations stay traceable to their original mention."
      />

      <div className="evidence-summary-strip">
        <span><Bookmark size={14} />Saved<strong>{evidenceMentions.filter((mention) => savedIds.includes(mention.id)).length}</strong></span>
        <span><Flag size={14} />Important<strong>{evidenceMentions.filter((mention) => importantIds.includes(mention.id)).length}</strong></span>
        <span><Link2 size={14} />Linked<strong>{linkedIds.size}</strong></span>
        <span><Library size={14} />Destinations<strong>{destinations.length}</strong></span>
      </div>

      {evidenceMentions.length ? (
        <div className="evidence-workspace-grid">
          <div className="evidence-queue">
            <div className="evidence-column-heading"><span>Evidence queue</span><small>{evidenceMentions.length} mentions</small></div>
            {evidenceMentions.map((mention) => {
              const mentionLinks = links.filter((link) => link.mentionId === mention.id);
              return (
                <button key={mention.id} onClick={() => onOpenMention(mention)}>
                  <div className={`platform-mark platform-mark--${mention.platform}`}>{mention.platform.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <span>{mention.author} · {mention.sourceLabel}</span>
                    <p>{mention.content}</p>
                    <div>
                      {savedIds.includes(mention.id) ? <Badge><Bookmark size={9} />Saved</Badge> : null}
                      {importantIds.includes(mention.id) ? <Badge><Flag size={9} />Important</Badge> : null}
                      {mentionLinks.map((link) => <Badge key={link.id}>{link.destinationLabel}</Badge>)}
                    </div>
                  </div>
                  <span>{formatNumber(mention.engagement)}<small>engagement</small></span>
                  <ArrowRight size={14} />
                </button>
              );
            })}
          </div>

          <aside className="evidence-destinations">
            <div className="evidence-column-heading"><span>Connected to</span><small>Knowledge graph</small></div>
            {destinations.length ? destinations.map((destination) => (
              <div key={destination.label}><Link2 size={13} /><span>{destination.label}</span><strong>{destination.count}</strong></div>
            )) : <p>No destinations yet. Link a mention to research, a project, an insight, or a brief.</p>}
            <div className="evidence-next-action">
              <span>Build the evidence trail</span>
              <p>Open any mention to add context, or attach a new source directly.</p>
              <Button disabled={!mentions.length} onClick={() => mentions[0] && onUseEvidence(mentions[0])}>Link most recent mention</Button>
            </div>
          </aside>
        </div>
      ) : (
        <div className="radar-evidence-empty">
          <Library size={24} />
          <strong>No evidence saved yet.</strong>
          <p>Save, mark important, or link a mention from the conversation view.</p>
        </div>
      )}
    </section>
  );
}
