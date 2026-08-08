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
    if (!name.trim()) { setError("Give the project a clear name."); return; }
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
      setError(submitError instanceof Error ? submitError.message : "The project could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
      <button className="radar-overlay__scrim" onClick={() => { if (!pending) setProjectDialogOpen(false); }} aria-label="Close project form" />
      <form className="workspace-dialog" onSubmit={submit}>
        <header><div><span className="workspace-dialog__icon"><FolderKanban size={19} /></span><div><p className="eyebrow">{editingProject ? "Edit project" : "New project"}</p><h2 id="project-dialog-title">{editingProject ? "Keep the project context accurate." : "Give the work a clear home."}</h2><p>{editingProject ? "Changes are saved to your private cloud workspace." : "You can add listening, research, evidence, and briefs after creating it."}</p></div></div><button type="button" disabled={pending} onClick={() => setProjectDialogOpen(false)} aria-label="Close"><X size={18} /></button></header>
        <div className="workspace-dialog__body">
          <label><span>Project name *</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Launch strategy" /></label>
          <div><label><span>Brand / client</span><input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Optional" /></label><label><span>Market</span><input value={market} onChange={(event) => setMarket(event.target.value)} placeholder="Country, region, or audience" /></label></div>
          <label><span>Description / objective</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What decision, opportunity, or strategic question should this project help answer?" /></label>
          <label><span>Competitors</span><input value={competitors} onChange={(event) => setCompetitors(event.target.value)} placeholder="Optional, separated by commas" /></label>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
        <footer><Button type="button" disabled={pending} onClick={() => setProjectDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={pending} variant="dark">{pending ? "Saving…" : editingProject ? "Save changes" : "Create project"}</Button></footer>
      </form>
    </div>
  );
}
