"use client";

import { BookOpen, Cloud, ExternalLink, FileImage, FilePlus2, FileText, LoaderCircle, MessageSquareText, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { EvidenceDeleteDialog } from "@/components/evidence/evidence-delete-dialog";
import { PrivateEvidenceAsset } from "@/components/evidence/private-evidence-asset";
import { Badge, Button, Card, PageIntro, SectionHeader } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import { LibraryImportNotice } from "@/components/workspace/library-import-notice";
import { getSocialCaptureDetails } from "@/lib/evidence/social-capture";

export function ResearchPage() {
  const {
    projects,
    activeProjectId,
    setProjectDialogOpen,
    openCaptureDialog,
    researchItems,
    addResearch,
    deleteResearch,
    workspaceStatus,
    workspaceError,
    clearWorkspaceError,
    retryWorkspace,
    pendingResearchImports,
    importPendingResearch,
  } = useApp();
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Article");
  const [source, setSource] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState("");
  const [formError, setFormError] = useState("");
  const destinationProjectId = projects.some((project) => project.id === projectId)
    ? projectId
    : activeProjectId || projects[0]?.id || "";
  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const filtered = useMemo(() => researchItems.filter((item) => {
    const matchesProject = projectFilter === "all" || item.projectId === projectFilter;
    const haystack = `${item.title} ${item.publication} ${item.summary} ${item.tags.join(" ")}`.toLowerCase();
    return matchesProject && haystack.includes(query.toLowerCase());
  }), [projectFilter, query, researchItems]);
  const deleteCandidate = researchItems.find((item) => item.id === deleteCandidateId) ?? null;
  const deleteProject = deleteCandidate ? projects.find((project) => project.id === deleteCandidate.projectId) ?? null : null;

  function openAdd(nextType: string) {
    if (!projects.length) {
      setProjectDialogOpen(true);
      return;
    }
    setType(nextType);
    setFormError("");
    setAdding(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !destinationProjectId) return;
    setSaving(true);
    setFormError("");
    try {
      await addResearch({ projectId: destinationProjectId, title, type, source, summary });
      setTitle("");
      setSource("");
      setSummary("");
      setAdding(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Research could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <PageIntro eyebrow="Research library" title="Evidence, with a point of view." description="Collect source material, annotate what matters, and connect every strategic leap back to proof.">
        {projects.length ? <><Button onClick={() => openAdd("URL")}><FilePlus2 size={16} />Add URL</Button><Button onClick={() => openCaptureDialog("file")}><Upload size={16} />Upload file</Button><Button variant="dark" onClick={() => openAdd("Note")}><Plus size={16} />Add note</Button></> : <Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={16} />Create project first</Button>}
      </PageIntro>

      {workspaceError ? <div className="workspace-sync-notice workspace-sync-notice--error" role="alert"><div><strong>Cloud library needs attention</strong><span>{workspaceError}</span></div><div><Button size="sm" onClick={retryWorkspace}>Try again</Button><button type="button" aria-label="Dismiss error" onClick={clearWorkspaceError}>×</button></div></div> : null}

      {pendingResearchImports.length ? <LibraryImportNotice kind="research" items={pendingResearchImports} onImport={importPendingResearch} /> : null}

      {workspaceStatus === "loading" && !researchItems.length ? (
        <Card className="project-loading-state"><LoaderCircle className="spin" size={24} /><div><strong>Loading your private research…</strong><span>Sources are being retrieved from Supabase.</span></div></Card>
      ) : workspaceStatus === "error" && !researchItems.length ? (
        <EmptyState icon={Cloud} title="Your research could not be loaded." description="Sift has not substituted browser data for a failed cloud result. Check the connection and try again." actions={<Button variant="dark" onClick={retryWorkspace}>Try again</Button>} />
      ) : !researchItems.length ? (
        <EmptyState icon={BookOpen} title="Start building your knowledge base." description={projects.length ? "Add an article, URL, social post, report, statistic, quote, personal note, screenshot, or document. Every source is saved inside a project." : "Create a project first, then add articles, URLs, social posts, reports, statistics, quotes, notes, screenshots, and documents as evidence."} actions={projects.length ? <><Button variant="dark" onClick={() => openAdd("Article")}><FileText size={15} />Add article</Button><Button onClick={() => openCaptureDialog("social")}><MessageSquareText size={15} />Capture social</Button><Button onClick={() => openAdd("Note")}><Plus size={15} />Add note</Button><Button onClick={() => openCaptureDialog("file")}><Upload size={15} />Upload file</Button></> : <Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create your first project</Button>} />
      ) : (
        <>
          <div className="research-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search research, quotes, statistics, and notes" /><select aria-label="Filter research by project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="all">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
          <section className="research-list-section">
            <SectionHeader eyebrow="Cloud research" title="Source library" description={`${filtered.length} source${filtered.length === 1 ? "" : "s"}`} />
            <div className="research-list">
              {filtered.map((item) => {
                const social = getSocialCaptureDetails(item.metadata);
                return <Card className="research-row" key={item.id}>
                  <span className="research-row__icon">{social ? <MessageSquareText size={19} /> : item.type === "Report" ? <BookOpen size={19} /> : item.assets?.some((asset) => asset.kind === "image") ? <FileImage size={19} /> : <FileText size={19} />}</span>
                  <div className="research-row__main">
                    <div><Badge>{item.type}</Badge>{social ? <Badge className="research-provenance-badge">Strategist captured</Badge> : null}<span>{item.date}</span></div>
                    <h3>{item.title}</h3>
                    <p>{item.summary || "No key finding added."}</p>
                    {social ? <div className="research-social-context"><span><strong>{social.platform}</strong>{social.author ? ` · ${social.author}` : ""}{social.observedAt ? ` · observed ${social.observedAt}` : ""}</span>{social.caption || social.selectedComments ? <details><summary>View captured source text</summary>{social.caption ? <div><strong>Post text</strong><p>{social.caption}</p></div> : null}{social.selectedComments ? <div><strong>Selected comments</strong><p>{social.selectedComments}</p></div> : null}</details> : null}</div> : null}
                    {item.assets?.length ? <div className="research-row__assets">{item.assets.map((asset) => <PrivateEvidenceAsset key={asset.id} asset={asset} />)}</div> : null}
                    {item.tags.length ? <div className="tag-row">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
                  </div>
                  <aside><span>{projectNames.get(item.projectId) ?? "Project"}</span><small>{item.publication}</small><div className="library-item-actions">{item.url ? <a href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={13} />Open source</a> : null}<button type="button" disabled={!item.cloudId || !projects.find((project) => project.id === item.projectId)?.cloudId} title={!item.cloudId ? "This source does not have a cloud identity." : undefined} onClick={() => setDeleteCandidateId(item.id)}><Trash2 size={13} />Delete</button></div></aside>
                </Card>;
              })}
              {!filtered.length ? <Card className="empty-state"><Search size={30} /><strong>No research matches these filters</strong><Button onClick={() => { setQuery(""); setProjectFilter("all"); }}>Clear filters</Button></Card> : null}
            </div>
          </section>
        </>
      )}

      {adding ? <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="research-dialog-title"><button className="radar-overlay__scrim" onClick={() => setAdding(false)} aria-label="Close" /><form className="workspace-dialog workspace-dialog--small" onSubmit={submit}><header><div><span className="workspace-dialog__icon"><BookOpen size={19} /></span><div><p className="eyebrow">Add research</p><h2 id="research-dialog-title">Capture a source and its value.</h2></div></div><button type="button" onClick={() => setAdding(false)} aria-label="Close"><X size={18} /></button></header><div className="workspace-dialog__body"><label><span>Project *</span><select value={destinationProjectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label><span>Title *</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Source or note title" /></label><label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}><option>Article</option><option>URL</option><option>Report</option><option>Note</option><option>Statistic</option><option>Quote</option></select></label><label><span>URL / publication</span><input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Optional" /></label><label><span>Key finding or note</span><textarea rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What matters here, and why?" /></label>{formError ? <p className="form-error" role="alert">{formError}</p> : null}</div><footer><Button type="button" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" variant="dark" disabled={!title.trim() || !destinationProjectId || saving}>{saving ? <LoaderCircle className="spin" size={14} /> : null}{saving ? "Saving…" : "Add research"}</Button></footer></form></div> : null}
      {deleteCandidate?.cloudId && deleteProject?.cloudId ? <EvidenceDeleteDialog identity={{ kind: "research", itemId: deleteCandidate.cloudId, projectId: deleteProject.cloudId }} title={deleteCandidate.title} libraryLabel="research" onClose={() => setDeleteCandidateId("")} onConfirm={() => deleteResearch(deleteCandidate.id)} /> : null}
    </div>
  );
}
