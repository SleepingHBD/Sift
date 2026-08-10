"use client";

import { Archive, Check, CircleX, ExternalLink, FileText, Link2, LoaderCircle, Network, RotateCcw, Save, Shapes, ShieldAlert, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PrivateEvidenceAsset } from "@/components/evidence/private-evidence-asset";
import { Badge } from "@/components/ui/primitives";
import { captureMethodLabel, evidenceKindLabel, evidenceReviewLabel } from "@/lib/evidence/inbox";
import type { EvidenceReference } from "@/lib/evidence/reference";
import { canDeleteEvidenceFromLibrary, relationshipTypeLabel, type EvidenceRelationshipSummary } from "@/lib/evidence/relationships";
import type { EvidenceAsset, EvidenceReviewStatus } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" });
}

function metadataText(item: EvidenceReference, key: string) {
  const value = item.provenance.metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function EvidenceDetailDrawer({
  evidence,
  projectName,
  associatedProjectNames,
  assets,
  relationships,
  relationshipStatus,
  relationshipError,
  onRetryRelationships,
  reviewPending,
  reviewError,
  reviewSaved,
  onReview,
  notePending,
  noteError,
  noteSaved,
  onSaveNote,
  topicPending,
  topicError,
  onTopics,
  onDelete,
  onClose,
}: {
  evidence: EvidenceReference | null;
  projectName: string;
  associatedProjectNames: string[];
  assets: EvidenceAsset[];
  relationships: EvidenceRelationshipSummary;
  relationshipStatus: "idle" | "loading" | "ready" | "error";
  relationshipError: string;
  onRetryRelationships: () => void;
  reviewPending: EvidenceReviewStatus | null;
  reviewError: string;
  reviewSaved: boolean;
  onReview: (status: EvidenceReviewStatus) => Promise<void>;
  notePending: boolean;
  noteError: string;
  noteSaved: boolean;
  onSaveNote: (note: string) => Promise<boolean>;
  topicPending: boolean;
  topicError: string;
  onTopics: (mode: "add" | "remove", topics: string) => Promise<boolean>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [noteDraft, setNoteDraft] = useState(evidence?.notes ?? "");
  const [topicDraft, setTopicDraft] = useState("");

  useEffect(() => {
    if (!evidence) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [evidence, onClose]);

  if (!evidence) return null;
  const selectedComments = metadataText(evidence, "selected_comments");
  const limitation = metadataText(evidence, "capture_limitation");
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const sharedTagKeys = new Set(evidence.organizationTags.map((tag) => tag.toLocaleLowerCase()));
  const sourceLabels = evidence.tags.filter((tag) => !sharedTagKeys.has(tag.toLocaleLowerCase()));

  return (
    <div className="radar-overlay radar-overlay--drawer" role="dialog" aria-modal="true" aria-labelledby="evidence-detail-title">
      <button className="radar-overlay__scrim" onClick={onClose} aria-label="Close evidence detail" />
      <aside className="radar-drawer inbox-detail-drawer">
        <header>
          <div><p className="eyebrow">Evidence detail</p><h2 id="evidence-detail-title">{evidence.title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="inbox-detail-drawer__badges">
          <Badge>{evidenceKindLabel(evidence.kind)}</Badge>
          <Badge>{captureMethodLabel(evidence.provenance.captureMethod)}</Badge>
          <Badge>{evidenceReviewLabel(evidence.reviewStatus)}</Badge>
        </div>

        <section className="inbox-detail-drawer__review" aria-labelledby="evidence-review-heading">
          <div><p className="drawer-section-label" id="evidence-review-heading">Review status</p>{reviewSaved ? <Badge>Saved to cloud</Badge> : null}</div>
          <p>Classify this source without changing its original content.</p>
          <div className="inbox-detail-drawer__review-options">
            {([
              { status: "unreviewed", label: "Needs review", icon: RotateCcw },
              { status: "relevant", label: "Relevant", icon: Check },
              { status: "irrelevant", label: "Not relevant", icon: CircleX },
              { status: "archived", label: "Archive", icon: Archive },
            ] as const).map((option) => {
              const Icon = option.icon;
              const active = evidence.reviewStatus === option.status;
              const pending = reviewPending === option.status;
              return <button type="button" aria-pressed={active} className={active ? "active" : ""} disabled={reviewPending !== null} onClick={() => void onReview(option.status)} key={option.status}>{pending ? <LoaderCircle className="spin" size={14} /> : <Icon size={14} />}<span>{option.label}</span></button>;
            })}
          </div>
          {reviewError ? <p className="form-error" role="alert">{reviewError}</p> : null}
        </section>

        <section className="inbox-detail-drawer__section">
          <p className="drawer-section-label">Source evidence</p>
          {evidence.originalContent ? <blockquote>{evidence.originalContent}</blockquote> : <p className="inbox-detail-drawer__muted">No source text was preserved for this item.</p>}
          {selectedComments ? <div className="inbox-detail-drawer__comments"><span>Selected comments</span><p>{selectedComments}</p></div> : null}
          {evidence.kind === "mention" ? <div className="inbox-detail-drawer__signal"><span>{evidence.sentiment} sentiment</span><strong>{formatNumber(evidence.engagement)} estimated engagement</strong></div> : null}
        </section>

        {evidence.kind === "research" || evidence.initialInterpretation ? (
          <section className="inbox-detail-drawer__section" aria-labelledby="initial-interpretation-heading">
            <div className="inbox-detail-drawer__editor-heading"><div><p className="drawer-section-label" id="initial-interpretation-heading">Initial interpretation</p><span>Why this source may matter, recorded when it entered Sift.</span></div></div>
            <div className="inbox-detail-drawer__interpretation">
              {evidence.initialInterpretation ? <p>{evidence.initialInterpretation}</p> : <p className="inbox-detail-drawer__muted">No initial interpretation was recorded for this source.</p>}
            </div>
          </section>
        ) : null}

        <section className="inbox-detail-drawer__section inbox-detail-drawer__context inbox-detail-drawer__editor" aria-labelledby="strategist-note-heading">
          <div className="inbox-detail-drawer__editor-heading"><div><p className="drawer-section-label" id="strategist-note-heading">Working strategist notes</p><span>Evolving analysis added during review; separate from the capture-time interpretation.</span></div>{noteSaved ? <Badge>Saved to cloud</Badge> : null}</div>
          <textarea value={noteDraft} maxLength={10_000} disabled={notePending} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add a later thought, question, tension, connection, or follow-up here." />
          <div className="inbox-detail-drawer__editor-actions"><small>{noteDraft.length.toLocaleString()} / 10,000</small><button type="button" disabled={notePending || noteDraft.trim() === (evidence.notes ?? "")} onClick={() => void onSaveNote(noteDraft)}>{notePending ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}Save note</button></div>
          {noteError ? <p className="form-error" role="alert">{noteError}</p> : null}
        </section>

        {evidence.attachments.length ? (
          <section className="inbox-detail-drawer__section">
            <p className="drawer-section-label">Private attachments</p>
            <div className="inbox-detail-drawer__assets">
              {evidence.attachments.map((attachment) => {
                const asset = attachment.id ? assetById.get(attachment.id) : undefined;
                return asset ? <PrivateEvidenceAsset key={asset.id} asset={asset} /> : <div className="inbox-detail-drawer__asset-meta" key={attachment.path}><FileText size={17} /><span><strong>{attachment.name ?? "Private attachment"}</strong><small>Stored privately; preview metadata is unavailable.</small></span></div>;
              })}
            </div>
          </section>
        ) : null}

        <section className="inbox-detail-drawer__section inbox-detail-drawer__topic-editor" aria-labelledby="strategist-topics-heading">
          <div className="inbox-detail-drawer__editor-heading"><div><p className="drawer-section-label" id="strategist-topics-heading">Strategist topics</p><span>Your project taxonomy; separate from extracted tags and detected conversation topics.</span></div><Shapes size={16} /></div>
          {evidence.organizationTopics.length ? <div className="inbox-detail-drawer__topic-chips">{evidence.organizationTopics.map((topic) => <span key={topic}>{topic}<button type="button" disabled={topicPending} aria-label={`Remove topic ${topic}`} onClick={() => void onTopics("remove", topic)}><X size={12} /></button></span>)}</div> : <p className="inbox-detail-drawer__muted">No strategist topics assigned yet.</p>}
          <div className="inbox-detail-drawer__topic-add"><input value={topicDraft} disabled={topicPending} onChange={(event) => setTopicDraft(event.target.value)} placeholder="Add topics, separated by commas" aria-label="Add strategist topics" /><button type="button" disabled={topicPending || !topicDraft.trim()} onClick={() => void onTopics("add", topicDraft).then((saved) => { if (saved) setTopicDraft(""); })}>{topicPending ? <LoaderCircle className="spin" size={14} /> : <Shapes size={14} />}Assign</button></div>
          {topicError ? <p className="form-error" role="alert">{topicError}</p> : null}
          {evidence.organizationTags.length ? <><p className="drawer-section-label inbox-detail-drawer__taxonomy-label">Shared tags</p><div className="inbox-detail-drawer__taxonomy">{evidence.organizationTags.map((label) => <Badge key={`shared-${label}`}>{label}</Badge>)}</div></> : null}
          {(sourceLabels.length || evidence.topics.length) ? <><p className="drawer-section-label inbox-detail-drawer__taxonomy-label">Detected topics and source labels</p><div className="inbox-detail-drawer__taxonomy">{[...evidence.topics, ...sourceLabels].map((label) => <Badge key={`source-${label}`}>{label}</Badge>)}</div></> : null}
        </section>

        <section className="inbox-detail-drawer__section inbox-detail-drawer__relationships" aria-labelledby="evidence-relationships-heading">
          <div className="inbox-detail-drawer__relationships-heading"><div><p className="drawer-section-label" id="evidence-relationships-heading">Used in</p><span>Trace where this source contributes elsewhere in Sift.</span></div>{relationshipStatus === "ready" ? <Badge>{relationships.items.length}</Badge> : null}</div>
          {relationshipStatus === "loading" ? <div className="inbox-detail-drawer__relationships-state"><LoaderCircle className="spin" size={17} /><span>Checking evidence connections…</span></div> : null}
          {relationshipStatus === "error" ? <div className="inbox-detail-drawer__relationships-state inbox-detail-drawer__relationships-state--error"><ShieldAlert size={17} /><span>{relationshipError}</span><button type="button" onClick={onRetryRelationships}><RotateCcw size={13} />Try again</button></div> : null}
          {relationshipStatus === "ready" && !relationships.items.length ? <div className="inbox-detail-drawer__relationships-state"><Network size={17} /><span>No downstream relationships yet.</span></div> : null}
          {relationshipStatus === "ready" && relationships.items.length ? <ul>{relationships.items.map((relationship) => <li key={`${relationship.type}-${relationship.id}`}><span className="inbox-detail-drawer__relationship-icon"><Link2 size={14} /></span><span><strong>{relationship.label}</strong><small>{relationshipTypeLabel(relationship.type)}</small></span>{relationship.blocking ? <Badge>Strategic citation</Badge> : null}</li>)}</ul> : null}
          {relationshipStatus === "ready" && relationships.blockingCount ? <p className="inbox-detail-drawer__relationship-protection"><ShieldAlert size={14} />This source is protected from deletion and Radar retention while these strategic citations remain.</p> : null}
        </section>

        {canDeleteEvidenceFromLibrary(evidence.kind) ? (
          <section className="inbox-detail-drawer__section inbox-detail-drawer__source-management" aria-labelledby="source-management-heading">
            <div><p className="drawer-section-label" id="source-management-heading">Source management</p><span>Delete this source from Sift after checking its citations and other connections.</span></div>
            <button type="button" onClick={onDelete}><Trash2 size={14} />Delete source</button>
          </section>
        ) : null}

        <section className="inbox-detail-drawer__section">
          <p className="drawer-section-label">Provenance</p>
          <dl className="inbox-detail-drawer__provenance">
            <div><dt>Source project</dt><dd>{projectName}</dd></div>
            <div><dt>Available in</dt><dd>{associatedProjectNames.join(", ") || projectName}</dd></div>
            <div><dt>Captured via</dt><dd>{captureMethodLabel(evidence.provenance.captureMethod)}</dd></div>
            <div><dt>Captured</dt><dd>{formatDate(evidence.capturedAt)}</dd></div>
            <div><dt>Last reviewed</dt><dd>{formatDate(evidence.reviewedAt)}</dd></div>
            <div><dt>Published / observed</dt><dd>{formatDate(evidence.publishedAt)}</dd></div>
            <div><dt>Source</dt><dd>{evidence.sourceLabel}</dd></div>
            <div><dt>Author</dt><dd>{evidence.author ?? "Not recorded"}</dd></div>
          </dl>
          {limitation ? <p className="inbox-detail-drawer__limitation">{limitation}</p> : null}
        </section>

        <footer className="inbox-detail-drawer__footer">
          <span><Link2 size={13} />The inbox references the original record; it does not duplicate or rewrite it.</span>
          {evidence.originalUrl ? <a className="ui-button ui-button--dark ui-button--md" href={evidence.originalUrl} target="_blank" rel="noreferrer">Open original <ExternalLink size={14} /></a> : <span className="inbox-detail-drawer__unavailable">Original URL unavailable</span>}
        </footer>
      </aside>
    </div>
  );
}
