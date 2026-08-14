"use client";

import { AlertTriangle, LoaderCircle, ShieldAlert, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import type { StrategySessionTurnRecord } from "@/lib/strategy-pipeline/types";

export function NotebookEntryDeleteDialog({
  turn,
  protectedByWorkingPiece,
  connectionCount,
  onClose,
  onConfirm,
}: {
  turn: StrategySessionTurnRecord;
  protectedByWorkingPiece: boolean;
  connectionCount: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete() {
    if (deleting || protectedByWorkingPiece) return;
    setDeleting(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The notebook entry could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="notebook-entry-delete-title">
      <button className="radar-overlay__scrim" onClick={deleting ? undefined : onClose} aria-label="Close entry deletion" />
      <section className="workspace-dialog workspace-dialog--small evidence-delete-dialog notebook-entry-delete-dialog">
        <header>
          <div><span className="workspace-dialog__icon evidence-delete-dialog__icon"><Trash2 size={19} /></span><div><p className="eyebrow">Permanent deletion</p><h2 id="notebook-entry-delete-title">Delete this entry?</h2><p>This cannot be undone.</p></div></div>
          <button type="button" onClick={onClose} disabled={deleting} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="workspace-dialog__body evidence-delete-dialog__body">
          {protectedByWorkingPiece ? <div className="evidence-delete-dialog__state evidence-delete-dialog__state--blocked"><ShieldAlert size={21} /><div><strong>This entry is being used by your strategy.</strong><span>Dismiss or remove its downstream working piece before deleting the original notebook entry.</span></div></div> : <div className="evidence-delete-dialog__state evidence-delete-dialog__state--warning"><AlertTriangle size={20} /><div><strong>This permanently removes the entry from this notebook.</strong><span>Its source links and connections to other entries are detached. The original Research, Inspiration, or Radar evidence remains safely in your Library.</span></div></div>}

          <blockquote className="notebook-entry-delete-dialog__preview">{turn.metadata.capture_only === true ? "Source-only notebook entry" : turn.content}</blockquote>
          {turn.sources.length ? <p className="evidence-delete-dialog__footnote">{turn.sources.length} attached {turn.sources.length === 1 ? "source link will" : "source links will"} be removed from this entry. The sources themselves are not deleted.</p> : null}
          {connectionCount ? <p className="evidence-delete-dialog__footnote">{connectionCount} notebook {connectionCount === 1 ? "connection will" : "connections will"} also be removed.</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>

        <footer>
          <Button type="button" onClick={onClose} disabled={deleting}>Keep entry</Button>
          <Button type="button" variant="dark" disabled={protectedByWorkingPiece || deleting} onClick={() => void confirmDelete()}>{deleting ? <LoaderCircle className="spin" size={14} /> : protectedByWorkingPiece ? <ShieldAlert size={14} /> : <Trash2 size={14} />}{deleting ? "Deleting…" : protectedByWorkingPiece ? "Deletion blocked" : "Delete entry"}</Button>
        </footer>
      </section>
    </div>
  );
}
