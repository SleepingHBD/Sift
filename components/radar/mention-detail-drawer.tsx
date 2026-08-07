"use client";

import { Bookmark, ExternalLink, Flag, FlaskConical, Link2, MessageSquareText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import type { RadarEvidenceLink, RadarMention } from "@/lib/radar/types";
import { formatNumber } from "@/lib/utils";

interface MentionDetailDrawerProps {
  mention: RadarMention | null;
  related: RadarMention[];
  note: string;
  links: RadarEvidenceLink[];
  saved: boolean;
  important: boolean;
  onClose: () => void;
  onSaveNote: (note: string) => void;
  onToggleSaved: () => void;
  onToggleImportant: () => void;
  onUseEvidence: () => void;
  onOpenRelated: (mention: RadarMention) => void;
  onFilterKeyword: (keyword: string) => void;
}

export function MentionDetailDrawer({ mention, related, note, links, saved, important, onClose, onSaveNote, onToggleSaved, onToggleImportant, onUseEvidence, onOpenRelated, onFilterKeyword }: MentionDetailDrawerProps) {
  const [draftNote, setDraftNote] = useState(note);
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    const reset = window.setTimeout(() => { setDraftNote(note); setNoteSaved(false); }, 0);
    return () => window.clearTimeout(reset);
  }, [mention, note]);

  if (!mention) return null;
  const date = new Date(mention.publishedAt).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" });

  return (
    <div className="radar-overlay radar-overlay--drawer" role="dialog" aria-modal="true" aria-labelledby="mention-detail-title">
      <button className="radar-overlay__scrim" onClick={onClose} aria-label="Close mention detail" />
      <aside className="radar-drawer mention-detail">
        <header><div><p className="eyebrow">Mention detail</p><h2 id="mention-detail-title">Original evidence</h2></div><button onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="mention-detail__source">
          <div className={`platform-mark platform-mark--${mention.platform}`}>{mention.platform.slice(0, 1).toUpperCase()}</div>
          <div><strong>{mention.author}</strong><span>{mention.authorHandle ? `${mention.authorHandle} · ` : ""}{mention.sourceLabel}</span></div>
        </div>
        <div className="mention-detail__content"><FlaskConical size={15} /><p>{mention.content}</p></div>
        <div className="mention-detail__actions">
          <Button onClick={onToggleSaved} variant={saved ? "primary" : "secondary"}><Bookmark size={14} fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : "Save"}</Button>
          <Button onClick={onToggleImportant}><Flag size={14} fill={important ? "currentColor" : "none"} />{important ? "Important" : "Mark important"}</Button>
          <Button variant="dark" onClick={onUseEvidence}><Link2 size={14} />Use as evidence</Button>
          {mention.url ? <a className="ui-button ui-button--secondary ui-button--md" href={mention.url} target="_blank" rel="noreferrer">Open original <ExternalLink size={13} /></a> : <Button disabled title="No original source URL is available">Original unavailable</Button>}
        </div>
        <dl className="mention-detail__metrics">
          <div><dt>Published</dt><dd>{date}</dd></div><div><dt>Estimated engagement</dt><dd>{formatNumber(mention.engagement)}</dd></div>
          <div><dt>Likes</dt><dd>{formatNumber(mention.likes)}</dd></div><div><dt>Comments</dt><dd>{formatNumber(mention.comments)}</dd></div>
          <div><dt>Shares</dt><dd>{formatNumber(mention.shares)}</dd></div><div><dt>Views</dt><dd>{mention.views ? formatNumber(mention.views) : "Not available"}</dd></div>
          <div><dt>Sentiment</dt><dd><Badge className={`sentiment-badge sentiment-badge--${mention.sentiment}`}>{mention.sentiment}</Badge></dd></div><div><dt>Relevance</dt><dd>{mention.relevance}%</dd></div>
        </dl>
        <section className="mention-detail__taxonomy">
          <div><span>Detected topics</span><div>{mention.topics.map((topic) => <Badge key={topic}>{topic}</Badge>)}</div></div>
          <div><span>Keywords</span><div>{mention.keywords.map((keyword) => <button key={keyword} onClick={() => onFilterKeyword(keyword)}>{keyword}</button>)}</div></div>
        </section>
        <section className="mention-note">
          <div><MessageSquareText size={15} /><span>Strategist note</span>{noteSaved ? <Badge>Saved locally</Badge> : null}</div>
          <textarea rows={4} value={draftNote} onChange={(event) => { setDraftNote(event.target.value); setNoteSaved(false); }} placeholder="Add context, a question or why this matters…" />
          <Button onClick={() => { onSaveNote(draftNote); setNoteSaved(true); }}>Save note</Button>
        </section>
        <section className="mention-links">
          <span>Project associations</span>
          {links.length ? links.map((link) => <div key={link.id}><Link2 size={13} /><div><strong>{link.destinationLabel}</strong><small>{link.destination.replace("-", " ")} · linked {new Date(link.createdAt).toLocaleDateString("en-SG")}</small></div></div>) : <p>No evidence relationships yet.</p>}
        </section>
        <section className="related-mentions">
          <span>Related mentions</span>
          {related.length ? related.map((item) => <button key={item.id} onClick={() => onOpenRelated(item)}><strong>{item.author}</strong><p>{item.content}</p><small>{item.topics[0]} · {formatNumber(item.engagement)} engagement</small></button>) : <p>No related mentions in this date range.</p>}
        </section>
      </aside>
    </div>
  );
}
