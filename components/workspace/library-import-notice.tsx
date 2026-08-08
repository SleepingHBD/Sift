"use client";

import { Download, LoaderCircle, Plus, UploadCloud } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Card } from "@/components/ui/primitives";

export function LibraryImportNotice({
  kind,
  items,
  onImport,
}: {
  kind: "research" | "inspiration";
  items: unknown[];
  onImport: (projectId: string) => Promise<number>;
}) {
  const { projects, activeProjectId, setProjectDialogOpen } = useApp();
  const [projectId, setProjectId] = useState(activeProjectId || projects[0]?.id || "");
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const label = kind === "research" ? "research item" : "inspiration item";
  const destinationProjectId = projects.some((project) => project.id === projectId)
    ? projectId
    : activeProjectId || projects[0]?.id || "";

  function downloadBackup() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), kind, items }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sift-local-${kind}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importItems() {
    if (!destinationProjectId) return;
    setImporting(true);
    setNotice("");
    try {
      const count = await onImport(destinationProjectId);
      setNotice(`${count} ${label}${count === 1 ? " was" : "s were"} imported and verified.`);
    } catch {
      // AppProvider exposes the actionable cloud error without removing local records.
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="project-import-notice library-import-notice">
      <div className="project-import-notice__icon"><UploadCloud size={21} /></div>
      <div>
        <p className="eyebrow">Browser items found</p>
        <h2>Move {items.length} local {label}{items.length === 1 ? "" : "s"} into your cloud workspace.</h2>
        <p>Choose the project they belong to. Import is safe to retry, and browser records remain until Supabase confirms every item.</p>
        {projects.length ? <label><span>Destination project</span><select value={destinationProjectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label> : <p className="form-error">Create or import a project before moving these items.</p>}
        {notice ? <p className="library-import-notice__success">{notice}</p> : null}
      </div>
      <div>
        <Button size="sm" onClick={downloadBackup}><Download size={14} />Download backup</Button>
        {projects.length ? <Button size="sm" variant="dark" disabled={importing || !destinationProjectId} onClick={() => void importItems()}>{importing ? <LoaderCircle className="spin" size={14} /> : <UploadCloud size={14} />}{importing ? "Importing…" : "Import to cloud"}</Button> : <Button size="sm" variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={14} />Create project</Button>}
      </div>
    </Card>
  );
}
