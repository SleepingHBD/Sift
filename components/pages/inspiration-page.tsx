"use client";

import { Bookmark, Cloud, ExternalLink, Grid2X2, Images, List, LoaderCircle, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { EvidenceDeleteDialog } from "@/components/evidence/evidence-delete-dialog";
import { Badge, Button, Card, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import { LibraryImportNotice } from "@/components/workspace/library-import-notice";

export function InspirationPage() {
  const {
    projects, activeProjectId, setProjectDialogOpen, savedIds, toggleSaved,
    inspirationItems, addInspiration, deleteInspiration, workspaceStatus,
    workspaceError, clearWorkspaceError, retryWorkspace,
    pendingInspirationImports, importPendingInspiration,
  } = useApp();
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [adding, setAdding] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("URL / article");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState("");
  const [formError, setFormError] = useState("");
  const destinationProjectId = projects.some((project) => project.id === projectId)
    ? projectId
    : activeProjectId || projects[0]?.id || "";
  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const filtered = useMemo(() => inspirationItems.filter((item) => {
    const matchesProject = projectFilter === "all" || item.projectId === projectFilter;
    const haystack = `${item.title} ${item.brand} ${item.note} ${item.tags.join(" ")}`.toLowerCase();
    return matchesProject && haystack.includes(query.toLowerCase());
  }), [inspirationItems, projectFilter, query]);
  const deleteCandidate = inspirationItems.find((item) => item.id === deleteCandidateId) ?? null;
  const deleteProject = deleteCandidate ? projects.find((project) => project.id === deleteCandidate.projectId) ?? null : null;

  function openAdd() {
    if (!projects.length) {
      setProjectDialogOpen(true);
      return;
    }
    setFormError("");
    setAdding(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !destinationProjectId) return;
    setSaving(true);
    setFormError("");
    try {
      await addInspiration({ projectId: destinationProjectId, title, type, source, note });
      setTitle("");
      setSource("");
      setNote("");
      setAdding(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Inspiration could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const primaryAction = projects.length
    ? <Button variant="dark" onClick={openAdd}><Plus size={16} />Add inspiration</Button>
    : <Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={16} />Create project first</Button>;

  return (
    <div className="page">
      <PageIntro eyebrow="Inspiration library" title="Keep the work that makes you think." description="Build a visual memory of campaigns, artifacts, and ideas—and remember why each one mattered.">{primaryAction}</PageIntro>

      {workspaceError ? (
        <div className="workspace-sync-notice workspace-sync-notice--error" role="alert">
          <div><strong>Cloud library needs attention</strong><span>{workspaceError}</span></div>
          <div><Button size="sm" onClick={retryWorkspace}>Try again</Button><button type="button" aria-label="Dismiss error" onClick={clearWorkspaceError}>×</button></div>
        </div>
      ) : null}

      {pendingInspirationImports.length ? <LibraryImportNotice kind="inspiration" items={pendingInspirationImports} onImport={importPendingInspiration} /> : null}

      {workspaceStatus === "loading" && !inspirationItems.length ? (
        <Card className="project-loading-state"><LoaderCircle className="spin" size={24} /><div><strong>Loading your private inspiration…</strong><span>Saved references are being retrieved from Supabase.</span></div></Card>
      ) : workspaceStatus === "error" && !inspirationItems.length ? (
        <EmptyState icon={Cloud} title="Your inspiration could not be loaded." description="Sift has not substituted browser data for a failed cloud result. Check the connection and try again." actions={<Button variant="dark" onClick={retryWorkspace}>Try again</Button>} />
      ) : !inspirationItems.length ? (
        <EmptyState
          icon={Images}
          title="Your inspiration library is empty."
          description={projects.length ? "Save a URL, campaign, article, screenshot reference, social post, or personal idea inside a project." : "Create a project first, then save campaigns, posts, articles, visual references, and ideas you want to revisit."}
          actions={projects.length ? <Button variant="dark" onClick={openAdd}><Plus size={15} />Add inspiration</Button> : <Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create your first project</Button>}
        />
      ) : (
        <>
          <div className="library-toolbar">
            <label className="library-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns, ideas, and notes" /></label>
            <select className="library-project-filter" aria-label="Filter inspiration by project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="all">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
            <Button disabled title="Advanced filters are not available yet"><SlidersHorizontal size={15} />Filters later</Button>
            <div className="view-toggle"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid view"><Grid2X2 size={16} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="List view"><List size={17} /></button></div>
          </div>
          <div className={`library-grid library-grid--${view}`}>
            {filtered.map((item) => (
              <Card className="library-item" key={item.id}>
                <div className={`library-item__visual inspiration-visual--${item.palette}`}>
                  <span>{item.brand || projectNames.get(item.projectId)}</span>
                  <strong>{item.type.toUpperCase()}</strong>
                  <button aria-label={savedIds.includes(item.id) ? "Remove saved marker" : "Mark item as saved"} onClick={() => toggleSaved(item.id)}><Bookmark size={16} fill={savedIds.includes(item.id) ? "currentColor" : "none"} /></button>
                </div>
                <div className="library-item__copy">
                  <div><Badge>{item.type}</Badge><Badge>{projectNames.get(item.projectId) ?? "Project"}</Badge></div>
                  <h3>{item.title}</h3>
                  <p>{item.note || "No note added."}</p>
                  {item.tags.length ? <div className="tag-row">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
                  <small>{item.source} · {item.savedAt}</small>
                  <div className="library-item-actions">
                    {item.url ? <a href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={13} />Open source</a> : null}
                    <button type="button" disabled={!item.cloudId || !projects.find((project) => project.id === item.projectId)?.cloudId} title={!item.cloudId ? "This source does not have a cloud identity." : undefined} onClick={() => setDeleteCandidateId(item.id)}><Trash2 size={13} />Delete</button>
                  </div>
                </div>
              </Card>
            ))}
            {!filtered.length ? <Card className="empty-state"><Search size={30} /><strong>No inspiration matches these filters</strong><span>Try another phrase or project.</span><Button onClick={() => { setQuery(""); setProjectFilter("all"); }}>Clear filters</Button></Card> : null}
          </div>
        </>
      )}

      {adding ? (
        <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="inspiration-dialog-title">
          <button className="radar-overlay__scrim" onClick={() => setAdding(false)} aria-label="Close" />
          <form className="workspace-dialog workspace-dialog--small" onSubmit={submit}>
            <header><div><span className="workspace-dialog__icon"><Images size={19} /></span><div><p className="eyebrow">Add inspiration</p><h2 id="inspiration-dialog-title">Save what sparked something.</h2></div></div><button type="button" onClick={() => setAdding(false)} aria-label="Close"><X size={18} /></button></header>
            <div className="workspace-dialog__body">
              <label><span>Project *</span><select value={destinationProjectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label><span>Title *</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you saving?" /></label>
              <label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}><option>URL / article</option><option>Campaign</option><option>Image / screenshot reference</option><option>Social post</option><option>Personal idea</option></select></label>
              <label><span>URL or source</span><input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Optional" /></label>
              <label><span>Why it matters</span><textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Capture the useful thought, technique, or feeling." /></label>
              {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            </div>
            <footer><Button type="button" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" variant="dark" disabled={!title.trim() || !destinationProjectId || saving}>{saving ? <LoaderCircle className="spin" size={14} /> : null}{saving ? "Saving…" : "Save inspiration"}</Button></footer>
          </form>
        </div>
      ) : null}
      {deleteCandidate?.cloudId && deleteProject?.cloudId ? <EvidenceDeleteDialog identity={{ kind: "inspiration", itemId: deleteCandidate.cloudId, projectId: deleteProject.cloudId }} title={deleteCandidate.title} libraryLabel="inspiration" onClose={() => setDeleteCandidateId("")} onConfirm={() => deleteInspiration(deleteCandidate.id)} /> : null}
    </div>
  );
}
