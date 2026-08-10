"use client";

import { FormEvent, useState } from "react";
import { FolderKanban, X } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/primitives";
import type { Project } from "@/lib/types";

export function ProjectDialog() {
  const { projectDialogOpen, editingProject } = useApp();
  if (!projectDialogOpen) return null;
  return <ProjectDialogForm key={editingProject?.id ?? "new-project"} editingProject={editingProject} />;
}

function ProjectDialogForm({ editingProject }: { editingProject: Project | null }) {
  const { setProjectDialogOpen, createProject, updateProject } = useApp();
  const [name, setName] = useState(editingProject?.name ?? "");
  const [brand, setBrand] = useState(editingProject?.brand ?? "");
  const [market, setMarket] = useState(editingProject?.market ?? "");
  const [description, setDescription] = useState(editingProject?.description ?? editingProject?.focus ?? "");
  const [competitors, setCompetitors] = useState(editingProject?.competitors?.join(", ") ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Give the notebook a clear name."); return; }
    setPending(true);
    setError("");
    const input = {
      name,
      brand,
      market,
      description,
      competitors: competitors.split(",").map((item) => item.trim()).filter(Boolean),
    };
    try {
      if (editingProject) await updateProject(editingProject.id, input);
      else await createProject(input);
      setProjectDialogOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The notebook could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
      <button className="radar-overlay__scrim" onClick={() => { if (!pending) setProjectDialogOpen(false); }} aria-label="Close notebook form" />
      <form className="workspace-dialog" onSubmit={submit}>
        <header><div><span className="workspace-dialog__icon"><FolderKanban size={19} /></span><div><p className="eyebrow">{editingProject ? "Notebook context" : "New notebook"}</p><h2 id="project-dialog-title">{editingProject ? "Keep the context useful." : "Start with only a name."}</h2><p>{editingProject ? "These details help later when Sift needs brand or market context." : "Everything else can be added gradually when it becomes relevant."}</p></div></div><button type="button" disabled={pending} onClick={() => setProjectDialogOpen(false)} aria-label="Close"><X size={18} /></button></header>
        <div className="workspace-dialog__body">
          <label><span>Notebook name *</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="What are you working on?" /></label>
          <details className="workspace-dialog__optional" open={Boolean(editingProject)}>
            <summary><span>Add context</span><small>Optional · you can do this later</small></summary>
            <div className="workspace-dialog__optional-fields">
              <div><label><span>Brand / client</span><input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Optional" /></label><label><span>Market</span><input value={market} onChange={(event) => setMarket(event.target.value)} placeholder="Country, region, or audience" /></label></div>
              <label><span>Description / objective</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What are you trying to understand or decide?" /></label>
              <label><span>Competitors</span><input value={competitors} onChange={(event) => setCompetitors(event.target.value)} placeholder="Optional, separated by commas" /></label>
            </div>
          </details>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
        <footer><Button type="button" disabled={pending} onClick={() => setProjectDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={pending} variant="dark">{pending ? "Saving…" : editingProject ? "Save context" : "Create notebook"}</Button></footer>
      </form>
    </div>
  );
}
