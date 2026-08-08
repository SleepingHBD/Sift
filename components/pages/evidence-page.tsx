"use client";

import Link from "next/link";
import { ArrowRight, Cloud, Inbox, LoaderCircle, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { EvidenceDetailDrawer } from "@/components/evidence/evidence-detail-drawer";
import { Badge, Button, Card, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import {
  buildEvidenceInbox,
  captureMethodLabel,
  filterEvidenceInbox,
  evidenceReviewLabel,
  projectEvidenceId,
  type EvidenceInboxKindFilter,
  type EvidenceInboxView,
  type RadarInboxRecord,
} from "@/lib/evidence/inbox";
import type { EvidenceReference } from "@/lib/evidence/reference";
import { updateEvidenceReviewStatus, type EvidenceReviewUpdate } from "@/lib/evidence/repository";
import { listCloudRadar, type RadarCloudSnapshot } from "@/lib/radar/repository";
import type { EvidenceReviewStatus } from "@/lib/types";

const emptyRadar: RadarCloudSnapshot = { monitors: [], mentionsByMonitor: {}, runs: [], truncated: false };

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

function highlight(value: string, query: string) {
  const clean = query.trim();
  if (!clean) return value;
  const index = value.toLocaleLowerCase().indexOf(clean.toLocaleLowerCase());
  if (index < 0) return value;
  return <>{value.slice(0, index)}<mark>{value.slice(index, index + clean.length)}</mark>{value.slice(index + clean.length)}</>;
}

function evidenceKey(item: Pick<EvidenceReference, "kind" | "id">) {
  return `${item.kind}:${item.id}`;
}

export function EvidencePage() {
  const {
    projects,
    researchItems,
    inspirationItems,
    workspaceStatus,
    workspaceError,
    retryWorkspace,
    clearWorkspaceError,
    setProjectDialogOpen,
    openCaptureDialog,
  } = useApp();
  const [radar, setRadar] = useState<RadarCloudSnapshot>(emptyRadar);
  const [radarStatus, setRadarStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [radarError, setRadarError] = useState("");
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<EvidenceInboxKindFilter>("all");
  const [view, setView] = useState<EvidenceInboxView>("all");
  const [selectedKey, setSelectedKey] = useState("");
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, EvidenceReviewUpdate>>({});
  const [reviewPending, setReviewPending] = useState<EvidenceReviewStatus | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [reviewSaved, setReviewSaved] = useState(false);

  useEffect(() => {
    if (workspaceStatus !== "ready" || !projects.length) return;
    let active = true;
    const loadTimer = window.setTimeout(() => {
      setRadarStatus("loading");
      setRadarError("");
      void listCloudRadar(projects).then((snapshot) => {
        if (!active) return;
        setRadar(snapshot);
        setRadarStatus("ready");
      }).catch((error: unknown) => {
        if (!active) return;
        setRadar(emptyRadar);
        setRadarStatus("error");
        setRadarError(error instanceof Error ? error.message : "Radar evidence could not be loaded.");
      });
    }, 0);
    return () => { active = false; window.clearTimeout(loadTimer); };
  }, [projects, workspaceStatus]);

  const radarRecords = useMemo(() => radar.monitors.flatMap((monitor): RadarInboxRecord[] =>
    (radar.mentionsByMonitor[monitor.id] ?? []).map((mention) => ({ mention, projectClientRef: monitor.projectId }))), [radar]);
  const dataset = useMemo(() => buildEvidenceInbox({ projects, radarRecords, researchItems, inspirationItems }), [inspirationItems, projects, radarRecords, researchItems]);
  const effectiveItems = useMemo(() => dataset.items.map((item) => {
    const override = reviewOverrides[evidenceKey(item)];
    return override ? { ...item, reviewStatus: override.reviewStatus, reviewedAt: override.reviewedAt } : item;
  }), [dataset.items, reviewOverrides]);
  const filtered = useMemo(() => filterEvidenceInbox(effectiveItems, {
    query,
    projectId: projectFilter,
    kind: kindFilter,
    view,
  }), [effectiveItems, kindFilter, projectFilter, query, view]);
  const projectNames = useMemo(() => new Map(projects.flatMap((project) => [
    [project.id, project.name] as const,
    [projectEvidenceId(project), project.name] as const,
  ])), [projects]);
  const allAssets = useMemo(() => researchItems.flatMap((item) => item.assets ?? []), [researchItems]);
  const selected = effectiveItems.find((item) => evidenceKey(item) === selectedKey) ?? null;
  const needsReview = effectiveItems.filter((item) => item.reviewStatus === "unreviewed").length;
  const sourceKinds = new Set(effectiveItems.map((item) => item.kind)).size;
  const filtersActive = Boolean(query.trim()) || projectFilter !== "all" || kindFilter !== "all" || view !== "all";

  function clearFilters() {
    setQuery("");
    setProjectFilter("all");
    setKindFilter("all");
    setView("all");
  }

  async function reviewEvidence(status: EvidenceReviewStatus) {
    if (!selected || reviewPending) return;
    setReviewPending(status);
    setReviewError("");
    setReviewSaved(false);
    try {
      const update = await updateEvidenceReviewStatus(selected, status);
      setReviewOverrides((current) => ({ ...current, [evidenceKey(selected)]: update }));
      setReviewSaved(true);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Review status could not be saved.");
    } finally {
      setReviewPending(null);
    }
  }

  function openEvidence(item: EvidenceReference) {
    setSelectedKey(evidenceKey(item));
    setReviewError("");
    setReviewSaved(false);
  }

  function closeEvidence() {
    setSelectedKey("");
    setReviewError("");
    setReviewSaved(false);
  }

  return (
    <div className="page evidence-inbox-page">
      <PageIntro eyebrow="Evidence inbox" title="Review what you’ve collected." description="One traceable queue for conversations, research, social captures, files, and inspiration across your projects.">
        {!projects.length ? <Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={16} />Create project</Button> : null}
      </PageIntro>

      {workspaceError ? <div className="workspace-sync-notice workspace-sync-notice--error" role="alert"><div><strong>Cloud workspace needs attention</strong><span>{workspaceError}</span></div><div><Button size="sm" onClick={retryWorkspace}>Try again</Button><button type="button" aria-label="Dismiss error" onClick={clearWorkspaceError}>×</button></div></div> : null}
      {radarError ? <div className="workspace-sync-notice workspace-sync-notice--error" role="alert"><div><strong>Radar evidence could not be added to this view</strong><span>{radarError} Research and inspiration remain available below.</span></div><button type="button" aria-label="Dismiss Radar error" onClick={() => setRadarError("")}>×</button></div> : null}

      {workspaceStatus === "loading" && !projects.length ? (
        <Card className="project-loading-state"><LoaderCircle className="spin" size={24} /><div><strong>Loading your private evidence…</strong><span>Project records are being retrieved from Supabase.</span></div></Card>
      ) : workspaceStatus === "error" && !projects.length ? (
        <EmptyState icon={Cloud} title="Your evidence could not be loaded." description="Sift has not substituted browser data for a failed cloud result. Check the connection and try again." actions={<Button variant="dark" onClick={retryWorkspace}>Try again</Button>} />
      ) : !projects.length ? (
        <EmptyState icon={Inbox} title="Create a project before collecting evidence." description="Evidence stays attached to a real project so its provenance and strategic context remain clear." actions={<Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create your first project</Button>} />
      ) : !dataset.items.length && radarStatus === "loading" ? (
        <Card className="project-loading-state"><LoaderCircle className="spin" size={24} /><div><strong>Building your evidence inbox…</strong><span>Radar conversations are being combined with research and inspiration.</span></div></Card>
      ) : !dataset.items.length ? (
        <EmptyState icon={Inbox} title="Your evidence inbox is empty." description="Capture a source, add research, save inspiration, or run a permitted Radar monitor. Each item will appear here with its original provenance." actions={<><Button variant="dark" onClick={() => openCaptureDialog("url")}><Plus size={15} />Capture evidence</Button><Link className="ui-button ui-button--secondary ui-button--md" href="/radar">Open Radar <ArrowRight size={14} /></Link></>} />
      ) : (
        <>
          <section className="evidence-inbox-summary" aria-label="Evidence inbox summary">
            <div><span>Evidence</span><strong>{dataset.items.length.toLocaleString()}</strong></div>
            <div><span>Needs review</span><strong>{needsReview.toLocaleString()}</strong></div>
            <div><span>Evidence types</span><strong>{sourceKinds}</strong></div>
            <div><span>Radar</span><strong>{radarStatus === "loading" ? <LoaderCircle className="spin" size={17} /> : radarRecords.length.toLocaleString()}</strong></div>
          </section>

          <div className="evidence-inbox-view-tabs" role="tablist" aria-label="Evidence views">
            {([['all', 'All evidence'], ['needs-review', 'Needs review'], ['recent', 'Recently added']] as const).map(([id, label]) => <button type="button" role="tab" aria-selected={view === id} className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}>{label}{id === "needs-review" ? <span>{needsReview}</span> : null}</button>)}
          </div>

          <div className="evidence-inbox-toolbar">
            <label className="evidence-inbox-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search source text, notes, authors, topics, and tags" /></label>
            <select aria-label="Filter evidence by project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="all">All projects</option>{projects.map((project) => <option key={project.id} value={projectEvidenceId(project)}>{project.name}</option>)}</select>
            <select aria-label="Filter evidence by type" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as EvidenceInboxKindFilter)}><option value="all">All evidence types</option><option value="mention">Radar mentions</option><option value="research">Research & captures</option><option value="inspiration">Inspiration</option></select>
            {filtersActive ? <button className="evidence-inbox-clear" type="button" onClick={clearFilters}><X size={14} />Clear</button> : null}
          </div>

          {radar.truncated ? <div className="evidence-inbox-coverage-notice">Radar is showing the newest 5,000 authorized mentions. Server-side cursor search arrives in the next inbox increment.</div> : null}
          {dataset.excludedRadarCount ? <div className="evidence-inbox-coverage-notice">{dataset.excludedRadarCount.toLocaleString()} unassigned Personal Radar {dataset.excludedRadarCount === 1 ? "mention remains" : "mentions remain"} in Radar until connected to a project.</div> : null}

          <div className="evidence-inbox-list" aria-live="polite">
            <div className="evidence-inbox-list__head"><span>Evidence</span><span>Provenance</span><span>Project</span><span>Captured</span><span>Status</span><span /></div>
            {filtered.map((item) => (
              <button type="button" className="evidence-inbox-row" key={`${item.kind}:${item.id}`} onClick={() => openEvidence(item)}>
                <span className={`evidence-inbox-row__kind evidence-inbox-row__kind--${item.kind}`}>{item.kind === "mention" ? "M" : item.kind === "research" ? "R" : "I"}</span>
                <span className="evidence-inbox-row__copy"><strong>{highlight(item.title, query)}</strong><small>{highlight(item.excerpt ?? item.notes ?? "No excerpt preserved.", query)}</small></span>
                <span className="evidence-inbox-row__provenance"><strong>{captureMethodLabel(item.provenance.captureMethod)}</strong><small>{item.sourceLabel}{item.author ? ` · ${item.author}` : ""}</small></span>
                <span className="evidence-inbox-row__project">{projectNames.get(item.projectId) ?? "Project"}</span>
                <span className="evidence-inbox-row__date">{formatDate(item.capturedAt)}</span>
                <Badge className={`evidence-inbox-row__status evidence-inbox-row__status--${item.reviewStatus}`}>{evidenceReviewLabel(item.reviewStatus)}</Badge>
                <ArrowRight className="evidence-inbox-row__arrow" size={15} />
              </button>
            ))}
          </div>

          {!filtered.length ? <Card className="evidence-inbox-no-results"><Search size={24} /><div><strong>No evidence matched these filters.</strong><span>Try a broader phrase, another project, or all evidence types.</span></div><Button onClick={clearFilters}>Clear filters</Button></Card> : null}
        </>
      )}

      <EvidenceDetailDrawer evidence={selected} projectName={selected ? projectNames.get(selected.projectId) ?? "Project" : ""} assets={allAssets} reviewPending={reviewPending} reviewError={reviewError} reviewSaved={reviewSaved} onReview={reviewEvidence} onClose={closeEvidence} />
    </div>
  );
}
