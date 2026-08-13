"use client";

import { AlertTriangle, BookOpenText, LoaderCircle, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import type { StrategySessionDetail } from "@/lib/strategy-pipeline/types";

export function NotebookPageDeleteDialog({
  page,
  sourceLinkCount,
  onClose,
  onConfirm,
}: {
  page: StrategySessionDetail;
  sourceLinkCount: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The notebook page could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="notebook-page-delete-title">
      <button className="radar-overlay__scrim" onClick={deleting ? undefined : onClose} aria-label="Close page deletion" />
      <section className="workspace-dialog workspace-dialog--small evidence-delete-dialog notebook-page-delete-dialog">
        <header>
          <div><span className="workspace-dialog__icon evidence-delete-dialog__icon"><Trash2 size={19} /></span><div><p className="eyebrow">Permanent deletion</p><h2 id="notebook-page-delete-title">Delete this page?</h2><p>This cannot be undone.</p></div></div>
          <button type="button" onClick={onClose} disabled={deleting} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="workspace-dialog__body evidence-delete-dialog__body">
          <div className="evidence-delete-dialog__state evidence-delete-dialog__state--warning"><AlertTriangle size={20} /><div><strong>This permanently removes the whole notebook page.</strong><span>Its thoughts, attached source links, ChatGPT working pieces, and formal strategy steps will be deleted with it.</span></div></div>
          <blockquote className="notebook-entry-delete-dialog__preview">{page.title}</blockquote>
          <dl className="notebook-page-delete-dialog__counts">
            <div><dt>Thoughts</dt><dd>{page.turns.length}</dd></div>
            <div><dt>Source links</dt><dd>{sourceLinkCount}</dd></div>
            <div><dt>Working pieces</dt><dd>{page.pieces.length}</dd></div>
            <div><dt>Strategy steps</dt><dd>{page.stages.length}</dd></div>
          </dl>
          <div className="notebook-page-delete-dialog__preserved"><BookOpenText size={18} /><div><strong>Your original evidence remains safe.</strong><span>Research, Inspiration, and Radar records in your Library are not deleted—only their links to this page are removed.</span></div></div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>

        <footer>
          <Button type="button" onClick={onClose} disabled={deleting}>Keep page</Button>
          <Button type="button" variant="dark" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}{deleting ? "Deleting…" : "Delete page"}</Button>
        </footer>
      </section>
    </div>
  );
}
