"use client";

import { Download, LoaderCircle, UploadCloud } from "lucide-react";
import { useState } from "react";
import { Button, Card } from "@/components/ui/primitives";
import type { LocalRadarAnnotationPayload } from "@/lib/radar/annotation-repository";
import type { LocalRadarPayload } from "@/lib/radar/repository";

interface RadarImportNoticeProps {
  payload: LocalRadarPayload | null;
  annotations: LocalRadarAnnotationPayload | null;
  onImport: () => Promise<number>;
}

export function RadarImportNotice({ payload, annotations, onImport }: RadarImportNoticeProps) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const mentionCount = Object.values(payload?.mentionsByMonitor ?? {}).reduce((sum, mentions) => sum + mentions.length, 0);
  const annotationCount = (annotations?.savedIds.length ?? 0)
    + (annotations?.importantIds.length ?? 0)
    + Object.keys(annotations?.notes ?? {}).length
    + (annotations?.evidenceLinks.length ?? 0);

  function downloadBackup() {
    const backup = {
      exportedAt: new Date().toISOString(),
      kind: "radar-browser-backup",
      radar: payload,
      annotations,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sift-local-radar-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importRecords() {
    setImporting(true);
    setError("");
    try {
      await onImport();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Radar records could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="project-import-notice">
      <div className="project-import-notice__icon"><UploadCloud size={21} /></div>
      <div>
        <p className="eyebrow">Browser Radar found</p>
        <h2>
          Move {payload?.monitors.length ?? 0} monitor{payload?.monitors.length === 1 ? "" : "s"}, {mentionCount} conversation{mentionCount === 1 ? "" : "s"}
          {annotationCount ? ` and ${annotationCount} annotation${annotationCount === 1 ? "" : "s"}` : ""} to Supabase.
        </h2>
        <p>Import is safe to retry. Browser records remain untouched until Sift reloads and verifies the cloud copy.</p>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
      <div>
        <Button size="sm" onClick={downloadBackup}><Download size={14} />Download backup</Button>
        <Button size="sm" variant="dark" disabled={importing} onClick={() => void importRecords()}>{importing ? <LoaderCircle className="spin" size={14} /> : <UploadCloud size={14} />}{importing ? "Importing..." : "Import to cloud"}</Button>
      </div>
    </Card>
  );
}
