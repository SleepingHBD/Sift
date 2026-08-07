"use client";

import { FormEvent, useState } from "react";
import { FolderKanban, X } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/primitives";

export function ProjectDialog() {
  const { projectDialogOpen, setProjectDialogOpen, createProject } = useApp();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [market, setMarket] = useState("");
  const [description, setDescription] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [error, setError] = useState("");

  if (!projectDialogOpen) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Give the project a clear name."); return; }
    createProject({
      name,
      brand,
      market,
      description,
      competitors: competitors.split(",").map((item) => item.trim()).filter(Boolean),
    });
    setName("");
    setBrand("");
    setMarket("");
    setDescription("");
    setCompetitors("");
    setError("");
    setProjectDialogOpen(false);
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
      <button className="radar-overlay__scrim" onClick={() => setProjectDialogOpen(false)} aria-label="Close project form" />
      <form className="workspace-dialog" onSubmit={submit}>
        <header><div><span className="workspace-dialog__icon"><FolderKanban size={19} /></span><div><p className="eyebrow">New project</p><h2 id="project-dialog-title">Give the work a clear home.</h2><p>You can add listening, research, evidence, and briefs after creating it.</p></div></div><button type="button" onClick={() => setProjectDialogOpen(false)} aria-label="Close"><X size={18} /></button></header>
        <div className="workspace-dialog__body">
          <label><span>Project name *</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Launch strategy" /></label>
          <div><label><span>Brand / client</span><input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Optional" /></label><label><span>Market</span><input value={market} onChange={(event) => setMarket(event.target.value)} placeholder="Country, region, or audience" /></label></div>
          <label><span>Description / objective</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What decision, opportunity, or strategic question should this project help answer?" /></label>
          <label><span>Competitors</span><input value={competitors} onChange={(event) => setCompetitors(event.target.value)} placeholder="Optional, separated by commas" /></label>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
        <footer><Button type="button" onClick={() => setProjectDialogOpen(false)}>Cancel</Button><Button type="submit" variant="dark">Create project</Button></footer>
      </form>
    </div>
  );
}
