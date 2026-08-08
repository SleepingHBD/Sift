"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Archive,
  ArrowRight,
  Cloud,
  Download,
  FolderKanban,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge, Button, Card, PageIntro, SectionHeader } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import type { Project } from "@/lib/types";

export function ProjectsPage() {
  const {
    projects,
    archivedProjects,
    setProjectDialogOpen,
    setActiveProjectId,
    openProjectEditor,
    archiveProject,
    restoreProject,
    deleteProject,
    workspaceStatus,
    workspaceError,
    clearWorkspaceError,
    retryWorkspace,
    pendingProjectImports,
    importPendingProjects,
  } = useApp();
  const [menuProjectId, setMenuProjectId] = useState("");
  const [busyProjectId, setBusyProjectId] = useState("");
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");

  async function runProjectAction(project: Project, action: () => Promise<void>) {
    setBusyProjectId(project.id);
    setNotice("");
    try {
      await action();
    } catch {
      // AppProvider exposes the actionable cloud error in the page notice.
    } finally {
      setBusyProjectId("");
      setMenuProjectId("");
    }
  }

  async function importProjects() {
    setImporting(true);
    setNotice("");
    try {
      const count = await importPendingProjects();
      setNotice(`${count} ${count === 1 ? "project was" : "projects were"} imported and verified in Supabase.`);
    } catch {
      // AppProvider keeps the local records and exposes a retryable error.
    } finally {
      setImporting(false);
    }
  }

  function downloadLocalBackup() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), projects: pendingProjectImports }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sift-local-projects-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <PageIntro eyebrow="Projects" title="Organise the question, not just the files." description="Each workspace connects listening, research, evidence, strategy, and briefs around one real decision.">
        <Button variant="dark" disabled={workspaceStatus !== "ready"} onClick={() => setProjectDialogOpen(true)}><Plus size={16} />New project</Button>
      </PageIntro>

      {workspaceError ? (
        <div className="workspace-sync-notice workspace-sync-notice--error" role="alert">
          <div><strong>Cloud workspace needs attention</strong><span>{workspaceError}</span></div>
          <div><Button size="sm" onClick={retryWorkspace}>Try again</Button><button type="button" aria-label="Dismiss error" onClick={clearWorkspaceError}>×</button></div>
        </div>
      ) : null}

      {notice ? <div className="workspace-sync-notice"><div><Cloud size={17} /><strong>{notice}</strong></div><button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}>×</button></div> : null}

      {pendingProjectImports.length ? (
        <Card className="project-import-notice">
          <div className="project-import-notice__icon"><UploadCloud size={21} /></div>
          <div><p className="eyebrow">Local projects found</p><h2>Move {pendingProjectImports.length} {pendingProjectImports.length === 1 ? "project" : "projects"} into your cloud workspace.</h2><p>{pendingProjectImports.map((project) => project.name).join(" · ")}. Import is safe to retry and local records are removed only after Supabase confirms them.</p></div>
          <div><Button size="sm" onClick={downloadLocalBackup}><Download size={14} />Download backup</Button><Button size="sm" variant="dark" disabled={importing || workspaceStatus === "error"} onClick={() => void importProjects()}>{importing ? <LoaderCircle className="spin" size={14} /> : <UploadCloud size={14} />}{importing ? "Importing…" : "Import to cloud"}</Button></div>
        </Card>
      ) : null}

      {workspaceStatus === "loading" && !projects.length ? (
        <Card className="project-loading-state"><LoaderCircle className="spin" size={24} /><div><strong>Loading your private workspace…</strong><span>Projects are being retrieved from Supabase.</span></div></Card>
      ) : workspaceStatus === "error" && !projects.length ? (
        <EmptyState icon={Cloud} title="Your projects could not be loaded." description="Sift has not replaced the cloud result with device data. Check the connection and try loading your private workspace again." actions={<Button variant="dark" onClick={retryWorkspace}>Try again</Button>} />
      ) : !projects.length ? (
        <EmptyState icon={FolderKanban} title="No projects yet." description="Create a project to connect a brand, market, strategic objective, research, and evidence in one place." actions={<Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create your first project</Button>} />
      ) : (
        <ProjectGrid
          projects={projects}
          menuProjectId={menuProjectId}
          busyProjectId={busyProjectId}
          onMenu={setMenuProjectId}
          onOpen={(project) => setActiveProjectId(project.id)}
          onEdit={(project) => openProjectEditor(project.id)}
          onArchive={(project) => void runProjectAction(project, () => archiveProject(project.id))}
        />
      )}

      {archivedProjects.length ? (
        <section className="archived-projects">
          <SectionHeader eyebrow="Archive" title="Archived projects" description="Restore work when it becomes relevant again. Permanent deletion is available only here." />
          <ProjectGrid
            projects={archivedProjects}
            archived
            menuProjectId={menuProjectId}
            busyProjectId={busyProjectId}
            onMenu={setMenuProjectId}
            onOpen={() => undefined}
            onEdit={(project) => openProjectEditor(project.id)}
            onRestore={(project) => void runProjectAction(project, () => restoreProject(project.id))}
            onDelete={(project) => {
              const confirmed = window.confirm(`Permanently delete “${project.name}” and its connected cloud data? This cannot be undone.`);
              if (confirmed) void runProjectAction(project, () => deleteProject(project.id));
            }}
          />
        </section>
      ) : null}
    </div>
  );
}

function ProjectGrid({
  projects,
  archived = false,
  menuProjectId,
  busyProjectId,
  onMenu,
  onOpen,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}: {
  projects: Project[];
  archived?: boolean;
  menuProjectId: string;
  busyProjectId: string;
  onMenu: (id: string) => void;
  onOpen: (project: Project) => void;
  onEdit: (project: Project) => void;
  onArchive?: (project: Project) => void;
  onRestore?: (project: Project) => void;
  onDelete?: (project: Project) => void;
}) {
  return (
    <div className="project-card-grid">
      {projects.map((project) => {
        const busy = busyProjectId === project.id;
        const menuOpen = menuProjectId === project.id;
        return (
          <Card className={`project-card${archived ? " project-card--archived" : ""}`} key={project.id}>
            <div className="project-card__top">
              <span className="project-card__mark" style={{ background: project.accent }}>{(project.brand || project.name).slice(0, 2).toUpperCase()}</span>
              <div className="project-card__actions"><Badge><Cloud size={11} />Cloud</Badge><button type="button" aria-label={`Project actions for ${project.name}`} aria-expanded={menuOpen} onClick={() => onMenu(menuOpen ? "" : project.id)}>{busy ? <LoaderCircle className="spin" size={17} /> : <MoreHorizontal size={18} />}</button>{menuOpen ? <div className="project-action-menu"><button type="button" onClick={() => onEdit(project)}><Pencil size={14} />Edit details</button>{onArchive ? <button type="button" onClick={() => onArchive(project)}><Archive size={14} />Archive</button> : null}{onRestore ? <button type="button" onClick={() => onRestore(project)}><RotateCcw size={14} />Restore</button> : null}{onDelete ? <button type="button" className="danger" onClick={() => onDelete(project)}><Trash2 size={14} />Delete permanently</button> : null}</div> : null}</div>
            </div>
            <h2>{project.name}</h2><p>{project.description || project.focus || "No objective added yet."}</p>
            <div className="project-meta"><span>Market<strong>{project.market || "Not set"}</strong></span><span>Observed mentions<strong>{project.counts.mentions.toLocaleString()}</strong></span><span>Research<strong>{project.counts.research}</strong></span><span>Insights<strong>{project.counts.insights}</strong></span></div>
            {project.competitors?.length ? <div className="project-competitors"><span>Competitors</span><p>{project.competitors.join(" · ")}</p></div> : null}
            {!archived ? <Link href="/" onClick={() => onOpen(project)}>Open workspace <ArrowRight size={14} /></Link> : <span className="project-card__archived-label">Archived cloud record</span>}
          </Card>
        );
      })}
    </div>
  );
}
