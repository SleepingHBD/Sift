"use client";

import { AlertTriangle, Trash2, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/primitives";
import type { MonitoringQuery } from "@/lib/radar/types";

interface DeleteMonitorDialogProps {
  open: boolean;
  monitor: MonitoringQuery | undefined;
  mentionCount: number;
  deleting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteMonitorDialog({ open, monitor, mentionCount, deleting, error, onClose, onConfirm }: DeleteMonitorDialogProps) {
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deleting, onClose, open]);

  if (!open || !monitor) return null;

  return (
    <div className="radar-overlay" role="alertdialog" aria-modal="true" aria-labelledby="delete-monitor-title" aria-describedby="delete-monitor-description">
      <button className="radar-overlay__scrim" disabled={deleting} onClick={onClose} aria-label="Cancel monitor deletion" />
      <section className="workspace-dialog workspace-dialog--small monitor-delete-dialog">
        <header>
          <div>
            <span className="workspace-dialog__icon"><Trash2 size={19} /></span>
            <div>
              <p className="eyebrow">Delete monitor</p>
              <h2 id="delete-monitor-title">Delete “{monitor.name}”?</h2>
              <p id="delete-monitor-description">This cannot be undone.</p>
            </div>
          </div>
          <button type="button" disabled={deleting} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="workspace-dialog__body monitor-delete-dialog__body">
          <div className="monitor-delete-summary">
            <AlertTriangle size={18} />
            <p>This will permanently remove the monitor, <strong>{mentionCount} collected mention{mentionCount === 1 ? "" : "s"}</strong>, run history, notes, saved flags, and evidence links attached to those mentions.</p>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
        <footer>
          <Button type="button" disabled={deleting} onClick={onClose}>Cancel</Button>
          <Button type="button" className="monitor-delete-confirm" disabled={deleting} onClick={onConfirm}>
            {deleting ? "Deleting…" : "Delete monitor"}
          </Button>
        </footer>
      </section>
    </div>
  );
}
