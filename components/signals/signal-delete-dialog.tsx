"use client";

import { AlertTriangle, FileClock, Link2, LoaderCircle, RotateCcw, ShieldAlert, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { deleteCloudSignal, previewCloudSignalDeletion } from "@/lib/signals/repository";
import type { SignalDeletionPreview, SignalRecord } from "@/lib/signals/types";

const emptyPreview: SignalDeletionPreview = {
  deletable: false,
  blockers: [],
  evidenceLinkCount: 0,
  assessmentCount: 0,
  revisionCount: 0,
  lineageCount: 0,
};

export function SignalDeleteDialog({
  signal,
  onClose,
  onDeleted,
}: {
  signal: SignalRecord;
  onClose: () => void;
  onDeleted: () => Promise<void> | void;
}) {
  const [preview, setPreview] = useState(emptyPreview);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setStatus("loading");
      setLoadError("");
      void previewCloudSignalDeletion(signal.id).then((result) => {
        if (!active) return;
        setPreview(result);
        setStatus("ready");
      }).catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Signal connections could not be checked.");
        setStatus("error");
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [retryVersion, signal.id]);

  async function confirmDelete() {
    if (status !== "ready" || !preview.deletable || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteCloudSignal(signal.id);
      await onDeleted();
      onClose();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "The candidate could not be deleted.");
      setRetryVersion((current) => current + 1);
    } finally {
      setDeleting(false);
    }
  }

  const removableRecords = preview.evidenceLinkCount + preview.assessmentCount + preview.revisionCount;

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="signal-delete-title">
      <button className="radar-overlay__scrim" onClick={deleting ? undefined : onClose} aria-label="Close candidate deletion check" />
      <section className="workspace-dialog workspace-dialog--small evidence-delete-dialog signal-delete-dialog">
        <header>
          <div><span className="workspace-dialog__icon evidence-delete-dialog__icon"><Trash2 size={19} /></span><div><p className="eyebrow">Permanent deletion</p><h2 id="signal-delete-title">Delete “{signal.title}”?</h2><p>Sift checks its strategic relationships before allowing removal.</p></div></div>
          <button type="button" onClick={onClose} disabled={deleting} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="workspace-dialog__body evidence-delete-dialog__body">
          {status === "loading" ? <div className="evidence-delete-dialog__loading"><LoaderCircle className="spin" size={20} /><div><strong>Checking the candidate’s history…</strong><span>Promotion, merge, split, evidence, and assessment relationships are being verified.</span></div></div> : null}

          {status === "error" ? <div className="evidence-delete-dialog__state evidence-delete-dialog__state--error"><AlertTriangle size={20} /><div><strong>Deletion safety could not be verified.</strong><span>{loadError}</span></div><Button size="sm" onClick={() => setRetryVersion((current) => current + 1)}><RotateCcw size={13} />Try again</Button></div> : null}

          {status === "ready" && !preview.deletable ? <div className="evidence-delete-dialog__state evidence-delete-dialog__state--blocked"><ShieldAlert size={21} /><div><strong>This Signal is protected from deletion.</strong><span>Dismiss it instead; its provenance must remain available.</span></div></div> : null}

          {status === "ready" && preview.blockers.length ? <ul className="signal-delete-dialog__blockers">{preview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}

          {status === "ready" && preview.deletable ? <div className="evidence-delete-dialog__state evidence-delete-dialog__state--warning"><AlertTriangle size={20} /><div><strong>This permanently removes only the working Signal.</strong><span>Original Radar conversations, Research, and Inspiration remain in Sift. Their links to this candidate are detached.</span></div></div> : null}

          {status === "ready" && preview.deletable && removableRecords ? <div className="signal-delete-dialog__counts">
            {preview.evidenceLinkCount ? <div><Link2 size={14} /><span><strong>{preview.evidenceLinkCount}</strong>{preview.evidenceLinkCount === 1 ? "evidence link" : "evidence links"} detached</span></div> : null}
            {preview.assessmentCount ? <div><FileClock size={14} /><span><strong>{preview.assessmentCount}</strong>{preview.assessmentCount === 1 ? "assessment" : "assessments"} removed</span></div> : null}
            {preview.revisionCount ? <div><RotateCcw size={14} /><span><strong>{preview.revisionCount}</strong>{preview.revisionCount === 1 ? "history entry" : "history entries"} removed</span></div> : null}
          </div> : status === "ready" && preview.deletable ? <p className="evidence-delete-dialog__empty">This candidate has no connected evidence, assessments, or correction history.</p> : null}

          {deleteError ? <p className="form-error" role="alert">{deleteError}</p> : null}
        </div>

        <footer>
          <Button type="button" onClick={onClose} disabled={deleting}>Keep candidate</Button>
          <Button type="button" variant="dark" className="signal-delete-dialog__confirm" disabled={status !== "ready" || !preview.deletable || deleting} onClick={() => void confirmDelete()}>{deleting ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}{deleting ? "Deleting…" : preview.deletable ? "Delete permanently" : "Deletion blocked"}</Button>
        </footer>
      </section>
    </div>
  );
}
