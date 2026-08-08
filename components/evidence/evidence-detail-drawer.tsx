"use client";

import { Archive, Check, CircleX, ExternalLink, FileText, Link2, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useEffect } from "react";
import { PrivateEvidenceAsset } from "@/components/evidence/private-evidence-asset";
import { Badge } from "@/components/ui/primitives";
import { captureMethodLabel, evidenceKindLabel, evidenceReviewLabel } from "@/lib/evidence/inbox";
import type { EvidenceReference } from "@/lib/evidence/reference";
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
  assets,
  reviewPending,
  reviewError,
  reviewSaved,
  onReview,
  onClose,
}: {
  evidence: EvidenceReference | null;
  projectName: string;
  assets: EvidenceAsset[];
  reviewPending: EvidenceReviewStatus | null;
  reviewError: string;
  reviewSaved: boolean;
  onReview: (status: EvidenceReviewStatus) => Promise<void>;
  onClose: () => void;
}) {
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

        {evidence.notes ? <section className="inbox-detail-drawer__section inbox-detail-drawer__context"><p className="drawer-section-label">Strategist context</p><p>{evidence.notes}</p></section> : null}

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

        {(evidence.tags.length || evidence.topics.length) ? (
          <section className="inbox-detail-drawer__section">
            <p className="drawer-section-label">Topics and tags</p>
            <div className="inbox-detail-drawer__taxonomy">{[...evidence.topics, ...evidence.tags].map((label) => <Badge key={label}>{label}</Badge>)}</div>
          </section>
        ) : null}

        <section className="inbox-detail-drawer__section">
          <p className="drawer-section-label">Provenance</p>
          <dl className="inbox-detail-drawer__provenance">
            <div><dt>Project</dt><dd>{projectName}</dd></div>
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
