"use client";

import { AlertTriangle, FileX2, Link2, LoaderCircle, RotateCcw, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import {
  listEvidenceRelationships,
  relationshipTypeLabel,
  type EvidenceIdentity,
  type EvidenceRelationshipSummary,
} from "@/lib/evidence/relationships";

const emptySummary: EvidenceRelationshipSummary = { items: [], blockingCount: 0, removableCount: 0 };

export function EvidenceDeleteDialog({
  identity,
  title,
  libraryLabel,
  onClose,
  onConfirm,
}: {
  identity: EvidenceIdentity;
  title: string;
  libraryLabel: "research" | "inspiration";
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [summary, setSummary] = useState(emptySummary);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const { kind, itemId, projectId } = identity;
  const blockers = useMemo(() => summary.items.filter((item) => item.blocking), [summary.items]);
  const removable = useMemo(() => summary.items.filter((item) => !item.blocking), [summary.items]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setStatus("loading");
      setLoadError("");
      void listEvidenceRelationships({ kind, itemId, projectId }).then((next) => {
        if (!active) return;
        setSummary(next);
        setStatus("ready");
      }).catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Evidence relationships could not be loaded.");
        setStatus("error");
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [itemId, kind, projectId, retryVersion]);

  async function confirmDelete() {
    if (status !== "ready" || summary.blockingCount || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "The source could not be deleted.");
      setRetryVersion((current) => current + 1);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="evidence-delete-title">
      <button className="radar-overlay__scrim" onClick={deleting ? undefined : onClose} aria-label="Close deletion check" />
      <section className="workspace-dialog workspace-dialog--small evidence-delete-dialog">
        <header>
          <div><span className="workspace-dialog__icon evidence-delete-dialog__icon"><FileX2 size={19} /></span><div><p className="eyebrow">Check connections first</p><h2 id="evidence-delete-title">Delete “{title}”?</h2></div></div>
          <button type="button" onClick={onClose} disabled={deleting} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="workspace-dialog__body evidence-delete-dialog__body">
          {status === "loading" ? <div className="evidence-delete-dialog__loading"><LoaderCircle className="spin" size={20} /><div><strong>Checking where this source is used…</strong><span>Sift is reading its evidence relationships before allowing deletion.</span></div></div> : null}

          {status === "error" ? <div className="evidence-delete-dialog__state evidence-delete-dialog__state--error"><AlertTriangle size={20} /><div><strong>Connections could not be verified.</strong><span>{loadError}</span></div><Button size="sm" onClick={() => setRetryVersion((current) => current + 1)}><RotateCcw size={13} />Try again</Button></div> : null}

          {status === "ready" && blockers.length ? (
            <div className="evidence-delete-dialog__state evidence-delete-dialog__state--blocked">
              <ShieldAlert size={21} />
              <div><strong>This source is protected from deletion.</strong><span>It supports {blockers.length} strategic {blockers.length === 1 ? "citation" : "citations"}. Remove those citations from their insight or brief first.</span></div>
            </div>
          ) : null}

          {status === "ready" && !blockers.length ? (
            <div className="evidence-delete-dialog__state evidence-delete-dialog__state--warning">
              <AlertTriangle size={20} />
              <div><strong>This permanently removes the {libraryLabel} source from Sift.</strong><span>Its tags, saved markers, project links, and private attachments will also be detached. An original public webpage or social post is not deleted.</span></div>
            </div>
          ) : null}

          {status === "ready" && summary.items.length ? (
            <div className="evidence-delete-dialog__relationships">
              <div><p className="drawer-section-label">Current connections</p><Badge>{summary.items.length}</Badge></div>
              <ul>
                {summary.items.map((relationship) => <li key={`${relationship.type}-${relationship.id}`}><span><Link2 size={14} /><span><strong>{relationship.label}</strong><small>{relationshipTypeLabel(relationship.type)}</small></span></span>{relationship.blocking ? <Badge>Protects source</Badge> : <Badge>Removed with source</Badge>}</li>)}
              </ul>
            </div>
          ) : status === "ready" ? <p className="evidence-delete-dialog__empty">No downstream relationships were found. The source can be deleted safely from Sift.</p> : null}

          {status === "ready" && removable.length && blockers.length ? <p className="evidence-delete-dialog__footnote">{removable.length} organizational {removable.length === 1 ? "connection is" : "connections are"} removable, but strategic citations still protect the source.</p> : null}
          {deleteError ? <p className="form-error" role="alert">{deleteError}</p> : null}
        </div>

        <footer>
          <Button type="button" onClick={onClose} disabled={deleting}>Keep source</Button>
          <Button type="button" variant="dark" disabled={status !== "ready" || summary.blockingCount > 0 || deleting} onClick={() => void confirmDelete()}>{deleting ? <LoaderCircle className="spin" size={14} /> : <FileX2 size={14} />}{deleting ? "Deleting…" : summary.blockingCount ? "Deletion blocked" : "Delete source"}</Button>
        </footer>
      </section>
    </div>
  );
}
