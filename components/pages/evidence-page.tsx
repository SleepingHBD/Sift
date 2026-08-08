"use client";

import Link from "next/link";
import { ArrowRight, Cloud, Inbox, LoaderCircle, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { EvidenceBulkToolbar, type EvidenceBulkFeedback } from "@/components/evidence/evidence-bulk-toolbar";
import { EvidenceDetailDrawer } from "@/components/evidence/evidence-detail-drawer";
import { EvidenceSavedViews } from "@/components/evidence/evidence-saved-views";
import { Badge, Button, Card, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import {
  captureMethodLabel,
  evidenceReviewLabel,
  organizeEvidenceInbox,
  projectEvidenceId,
  type EvidenceInboxGroup,
  type EvidenceInboxKindFilter,
  type EvidenceInboxSort,
  type EvidenceInboxView,
} from "@/lib/evidence/inbox";
import {
  addEvidenceItemProject,
  evidenceKey,
  updateEvidenceItemTags,
  type EvidenceBulkResult,
} from "@/lib/evidence/organization";
import type { EvidenceReference } from "@/lib/evidence/reference";
import {
  listEvidenceRelationships,
  type EvidenceRelationshipSummary,
} from "@/lib/evidence/relationships";
import {
  createEvidenceSavedView,
  deleteEvidenceSavedView,
  evidenceSavedViewMatches,
  listEvidenceSavedViews,
  updateEvidenceSavedView,
  type EvidenceSavedView,
  type EvidenceSavedViewDefinition,
} from "@/lib/evidence/saved-views";
import {
  assignEvidenceToProject,
  updateEvidenceReviewStatus,
  updateEvidenceReviewStatuses,
  updateEvidenceTags,
  type EvidenceReviewUpdate,
} from "@/lib/evidence/repository";
import {
  getEvidenceInboxStats,
  searchEvidencePage,
  type EvidenceInboxStats,
} from "@/lib/evidence/search";
import type { EvidenceReviewStatus } from "@/lib/types";

const emptyStats: EvidenceInboxStats = { total: 0, unreviewed: 0, reviewed: 0, kinds: 0 };
const emptyRelationships: EvidenceRelationshipSummary = { items: [], blockingCount: 0, removableCount: 0 };

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

function bulkFeedback(result: EvidenceBulkResult, verb: string): EvidenceBulkFeedback {
  const succeeded = result.succeededKeys.length;
  const failed = result.failures.length;
  if (!failed) return { tone: "success", message: `${succeeded} ${succeeded === 1 ? "item" : "items"} ${verb}.` };
  if (!succeeded) return { tone: "error", message: `No items were ${verb}.`, failures: result.failures };
  return { tone: "warning", message: `${succeeded} ${succeeded === 1 ? "item" : "items"} ${verb}; ${failed} need attention.`, failures: result.failures };
}

function applyReviewUpdates(
  items: EvidenceReference[],
  updates: Record<string, EvidenceReviewUpdate>,
  view: EvidenceInboxView,
) {
  const updatedItems = items.map((item) => {
    const update = updates[evidenceKey(item)];
    return update ? { ...item, reviewStatus: update.reviewStatus, reviewedAt: update.reviewedAt } : item;
  });

  return view === "needs-review"
    ? updatedItems.filter((item) => item.reviewStatus === "unreviewed")
    : updatedItems;
}

export function EvidencePage() {
  const {
    projects,
    researchItems,
    workspaceStatus,
    workspaceError,
    retryWorkspace,
    clearWorkspaceError,
    setProjectDialogOpen,
    openCaptureDialog,
  } = useApp();
  const [items, setItems] = useState<EvidenceReference[]>([]);
  const [evidenceStatus, setEvidenceStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [evidenceError, setEvidenceError] = useState("");
  const [stats, setStats] = useState<EvidenceInboxStats>(emptyStats);
  const [statsStatus, setStatsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<EvidenceInboxKindFilter>("all");
  const [view, setView] = useState<EvidenceInboxView>("all");
  const [sort, setSort] = useState<EvidenceInboxSort>("newest");
  const [group, setGroup] = useState<EvidenceInboxGroup>("none");
  const [savedViews, setSavedViews] = useState<EvidenceSavedView[]>([]);
  const [savedViewsStatus, setSavedViewsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [savedViewsRetryVersion, setSavedViewsRetryVersion] = useState(0);
  const [activeSavedViewId, setActiveSavedViewId] = useState("");
  const [savedViewPending, setSavedViewPending] = useState("");
  const [savedViewNotice, setSavedViewNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [reviewPending, setReviewPending] = useState<EvidenceReviewStatus | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [reviewSaved, setReviewSaved] = useState(false);
  const [relationships, setRelationships] = useState<EvidenceRelationshipSummary>(emptyRelationships);
  const [relationshipStatus, setRelationshipStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [relationshipError, setRelationshipError] = useState("");
  const [relationshipRetryVersion, setRelationshipRetryVersion] = useState(0);
  const [bulkPending, setBulkPending] = useState("");
  const [bulkNotice, setBulkNotice] = useState<EvidenceBulkFeedback | null>(null);
  const searchRequestVersion = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (workspaceStatus !== "ready" || !projects.length) return;
    let active = true;
    const requestVersion = ++searchRequestVersion.current;
    const loadTimer = window.setTimeout(() => {
      setEvidenceStatus("loading");
      setEvidenceError("");
      setPageError("");
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
      setSelectedKeys(new Set());
      setSelectedKey("");
      void searchEvidencePage({
        search: searchTerm,
        projectId: projectFilter === "all" ? null : projectFilter,
        kind: kindFilter,
        view,
        sort,
      }).then((page) => {
        if (!active || requestVersion !== searchRequestVersion.current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setEvidenceStatus("ready");
      }).catch((error: unknown) => {
        if (!active || requestVersion !== searchRequestVersion.current) return;
        setItems([]);
        setNextCursor(null);
        setHasMore(false);
        setEvidenceStatus("error");
        setEvidenceError(error instanceof Error ? error.message : "Evidence could not be loaded.");
      });
    }, 0);
    return () => { active = false; window.clearTimeout(loadTimer); };
  }, [kindFilter, projectFilter, projects.length, retryVersion, searchTerm, sort, view, workspaceStatus]);

  useEffect(() => {
    if (workspaceStatus !== "ready" || !projects.length) return;
    let active = true;
    const loadTimer = window.setTimeout(() => {
      setStatsStatus("loading");
      void getEvidenceInboxStats(projectFilter === "all" ? null : projectFilter).then((nextStats) => {
        if (!active) return;
        setStats(nextStats);
        setStatsStatus("ready");
      }).catch(() => {
        if (!active) return;
        setStats(emptyStats);
        setStatsStatus("error");
      });
    }, 0);
    return () => { active = false; window.clearTimeout(loadTimer); };
  }, [projectFilter, projects.length, retryVersion, workspaceStatus]);

  useEffect(() => {
    if (workspaceStatus !== "ready" || !projects.length) return;
    let active = true;
    const loadTimer = window.setTimeout(() => {
      setSavedViewsStatus("loading");
      void listEvidenceSavedViews().then((nextViews) => {
        if (!active) return;
        setSavedViews(nextViews);
        setActiveSavedViewId((current) => nextViews.some((item) => item.id === current) ? current : "");
        setSavedViewsStatus("ready");
      }).catch((error: unknown) => {
        if (!active) return;
        setSavedViewsStatus("error");
        setSavedViewNotice({ tone: "error", message: error instanceof Error ? error.message : "Saved views could not be loaded." });
      });
    }, 0);
    return () => { active = false; window.clearTimeout(loadTimer); };
  }, [projects.length, savedViewsRetryVersion, workspaceStatus]);

  const projectNames = useMemo(() => new Map(projects.flatMap((project) => [
    [project.id, project.name] as const,
    [projectEvidenceId(project), project.name] as const,
  ])), [projects]);
  const organized = useMemo(() => organizeEvidenceInbox(items, { sort, group, projectNames }), [group, items, projectNames, sort]);
  const allAssets = useMemo(() => researchItems.flatMap((item) => item.assets ?? []), [researchItems]);
  const selected = items.find((item) => evidenceKey(item) === selectedKey) ?? null;
  const selectedItems = items.filter((item) => selectedKeys.has(evidenceKey(item)));
  const visibleKeys = items.map(evidenceKey);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.has(key));
  const reviewedPercent = stats.total ? Math.round((stats.reviewed / stats.total) * 100) : 0;
  const filtersActive = Boolean(query.trim()) || projectFilter !== "all" || kindFilter !== "all" || view !== "all" || sort !== "newest" || group !== "none";
  const currentSavedView = useMemo<EvidenceSavedViewDefinition>(() => ({
    query,
    projectId: projectFilter === "all" ? null : projectFilter,
    kind: kindFilter,
    view,
    sort,
    group,
  }), [group, kindFilter, projectFilter, query, sort, view]);
  const activeSavedView = savedViews.find((item) => item.id === activeSavedViewId) ?? null;
  const savedViewDirty = activeSavedView ? !evidenceSavedViewMatches(activeSavedView, currentSavedView) : false;

  useEffect(() => {
    if (!selected?.cloudId) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setRelationshipStatus("loading");
      setRelationshipError("");
      void listEvidenceRelationships({ kind: selected.kind, itemId: selected.cloudId!, projectId: selected.projectId }).then((next) => {
        if (!active) return;
        setRelationships(next);
        setRelationshipStatus("ready");
      }).catch((error: unknown) => {
        if (!active) return;
        setRelationships(emptyRelationships);
        setRelationshipStatus("error");
        setRelationshipError(error instanceof Error ? error.message : "Evidence relationships could not be loaded.");
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [relationshipRetryVersion, selected?.cloudId, selected?.kind, selected?.projectId]);

  function clearFilters() {
    setQuery("");
    setProjectFilter("all");
    setKindFilter("all");
    setView("all");
    setSort("newest");
    setGroup("none");
  }

  function applySavedView(id: string) {
    setSavedViewNotice(null);
    setActiveSavedViewId(id);
    if (!id) return;
    const savedView = savedViews.find((item) => item.id === id);
    if (!savedView) return;
    const projectAvailable = !savedView.projectId || projects.some((project) => projectEvidenceId(project) === savedView.projectId);
    setQuery(savedView.query);
    setProjectFilter(projectAvailable && savedView.projectId ? savedView.projectId : "all");
    setKindFilter(savedView.kind);
    setView(savedView.view);
    setSort(savedView.sort);
    setGroup(savedView.group);
    setSelectedKeys(new Set());
    setSelectedKey("");
    if (!projectAvailable) setSavedViewNotice({ tone: "error", message: "That project is no longer available. The remaining saved filters were applied across all projects." });
  }

  async function saveCurrentView(name: string, id: string | null) {
    if (savedViewPending) return false;
    setSavedViewPending(id ? "Updating view…" : "Saving view…");
    setSavedViewNotice(null);
    try {
      const savedView = id
        ? await updateEvidenceSavedView(id, name, currentSavedView)
        : await createEvidenceSavedView(name, currentSavedView);
      setSavedViews((current) => [savedView, ...current.filter((item) => item.id !== savedView.id)]);
      setActiveSavedViewId(savedView.id);
      setSavedViewsStatus("ready");
      setSavedViewNotice({ tone: "success", message: id ? `“${savedView.name}” was updated.` : `“${savedView.name}” is now available from Saved views.` });
      return true;
    } catch (error) {
      setSavedViewNotice({ tone: "error", message: error instanceof Error ? error.message : "The saved view could not be stored." });
      return false;
    } finally {
      setSavedViewPending("");
    }
  }

  async function removeSavedView(id: string) {
    if (savedViewPending) return false;
    setSavedViewPending("Deleting view…");
    setSavedViewNotice(null);
    try {
      const deletedId = await deleteEvidenceSavedView(id);
      setSavedViews((current) => current.filter((item) => item.id !== deletedId));
      setActiveSavedViewId((current) => current === deletedId ? "" : current);
      setSavedViewNotice({ tone: "success", message: "The saved shortcut was deleted. No evidence was removed." });
      return true;
    } catch (error) {
      setSavedViewNotice({ tone: "error", message: error instanceof Error ? error.message : "The saved view could not be deleted." });
      return false;
    } finally {
      setSavedViewPending("");
    }
  }

  function toggleEvidence(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setBulkNotice(null);
  }

  function toggleVisible() {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleKeys.forEach((key) => next.delete(key));
      else visibleKeys.forEach((key) => next.add(key));
      return next;
    });
    setBulkNotice(null);
  }

  async function reviewEvidence(status: EvidenceReviewStatus) {
    if (!selected || reviewPending) return;
    setReviewPending(status);
    setReviewError("");
    setReviewSaved(false);
    try {
      const update = await updateEvidenceReviewStatus(selected, status);
      setItems((current) => applyReviewUpdates(current, { [evidenceKey(selected)]: update }, view));
      setReviewSaved(true);
      void refreshEvidenceStats();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Review status could not be saved.");
    } finally {
      setReviewPending(null);
    }
  }

  async function bulkReview(status: EvidenceReviewStatus) {
    if (!selectedItems.length || bulkPending) return;
    setBulkPending("Saving review status…");
    setBulkNotice(null);
    try {
      const result = await updateEvidenceReviewStatuses(selectedItems, status);
      setItems((current) => applyReviewUpdates(current, result.updates, view));
      setBulkNotice(bulkFeedback(result, "updated"));
      void refreshEvidenceStats();
    } catch (error) {
      setBulkNotice({ tone: "error", message: error instanceof Error ? error.message : "Review statuses could not be saved." });
    } finally {
      setBulkPending("");
    }
  }

  async function bulkTags(mode: "add" | "remove", tags: string) {
    if (!selectedItems.length || bulkPending) return false;
    setBulkPending(mode === "add" ? "Adding tags…" : "Removing tags…");
    setBulkNotice(null);
    try {
      const result = await updateEvidenceTags(selectedItems, tags, mode);
      setItems((current) => updateEvidenceItemTags(current, result.succeededKeys, result.tags, mode));
      setBulkNotice(bulkFeedback(result, mode === "add" ? "tagged" : "updated"));
      return result.failures.length === 0;
    } catch (error) {
      setBulkNotice({ tone: "error", message: error instanceof Error ? error.message : "Evidence tags could not be saved." });
      return false;
    } finally {
      setBulkPending("");
    }
  }

  async function bulkAssignProject(projectId: string) {
    if (!selectedItems.length || bulkPending) return false;
    setBulkPending("Adding evidence to project…");
    setBulkNotice(null);
    try {
      const result = await assignEvidenceToProject(selectedItems, projectId);
      setItems((current) => addEvidenceItemProject(current, result.succeededKeys, projectId));
      setBulkNotice(bulkFeedback(result, "linked to the project"));
      return result.failures.length === 0;
    } catch (error) {
      setBulkNotice({ tone: "error", message: error instanceof Error ? error.message : "Evidence could not be added to the project." });
      return false;
    } finally {
      setBulkPending("");
    }
  }

  async function refreshEvidenceStats() {
    try {
      const nextStats = await getEvidenceInboxStats(projectFilter === "all" ? null : projectFilter);
      setStats(nextStats);
      setStatsStatus("ready");
    } catch {
      setStatsStatus("error");
    }
  }

  async function loadNextPage() {
    if (!nextCursor || loadingMore) return;
    const requestVersion = searchRequestVersion.current;
    setLoadingMore(true);
    setPageError("");
    try {
      const page = await searchEvidencePage({
        search: searchTerm,
        projectId: projectFilter === "all" ? null : projectFilter,
        kind: kindFilter,
        view,
        sort,
        cursor: nextCursor,
      });
      if (requestVersion !== searchRequestVersion.current) return;
      setItems((current) => {
        const merged = new Map(current.map((item) => [evidenceKey(item), item]));
        for (const item of page.items) merged.set(evidenceKey(item), item);
        return [...merged.values()];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (error) {
      if (requestVersion !== searchRequestVersion.current) return;
      setPageError(error instanceof Error ? error.message : "The next evidence page could not be loaded.");
    } finally {
      if (requestVersion === searchRequestVersion.current) setLoadingMore(false);
    }
  }

  function openEvidence(item: EvidenceReference) {
    setRelationships(emptyRelationships);
    setRelationshipStatus("loading");
    setRelationshipError("");
    setSelectedKey(evidenceKey(item));
    setReviewError("");
    setReviewSaved(false);
  }

  function closeEvidence() {
    setRelationships(emptyRelationships);
    setRelationshipStatus("idle");
    setRelationshipError("");
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

      {workspaceStatus === "loading" && !projects.length ? (
        <Card className="project-loading-state"><LoaderCircle className="spin" size={24} /><div><strong>Loading your private evidence…</strong><span>Project records are being retrieved from Supabase.</span></div></Card>
      ) : workspaceStatus === "error" && !projects.length ? (
        <EmptyState icon={Cloud} title="Your evidence could not be loaded." description="Sift has not substituted browser data for a failed cloud result. Check the connection and try again." actions={<Button variant="dark" onClick={retryWorkspace}>Try again</Button>} />
      ) : !projects.length ? (
        <EmptyState icon={Inbox} title="Create a project before collecting evidence." description="Evidence stays attached to a real project so its provenance and strategic context remain clear." actions={<Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create your first project</Button>} />
      ) : evidenceStatus === "loading" && !items.length ? (
        <Card className="project-loading-state"><LoaderCircle className="spin" size={24} /><div><strong>Searching your evidence…</strong><span>Supabase is retrieving the first authorized page across Radar, Research, and Inspiration.</span></div></Card>
      ) : evidenceStatus === "error" ? (
        <EmptyState icon={Cloud} title="Your evidence could not be searched." description={evidenceError || "The server-side evidence query did not complete."} actions={<Button variant="dark" onClick={() => setRetryVersion((current) => current + 1)}>Try again</Button>} />
      ) : statsStatus === "ready" && stats.total === 0 && projectFilter === "all" ? (
        <EmptyState icon={Inbox} title="Your evidence inbox is empty." description="Capture a source, add research, save inspiration, or run a permitted Radar monitor. Each item will appear here with its original provenance." actions={<><Button variant="dark" onClick={() => openCaptureDialog("url")}><Plus size={15} />Capture evidence</Button><Link className="ui-button ui-button--secondary ui-button--md" href="/radar">Open Radar <ArrowRight size={14} /></Link></>} />
      ) : (
        <>
          <section className="evidence-inbox-summary" aria-label="Evidence inbox summary">
            <div><span>Evidence</span><strong>{stats.total.toLocaleString()}</strong></div>
            <div><span>Needs review</span><strong>{stats.unreviewed.toLocaleString()}</strong></div>
            <div><span>Reviewed</span><strong>{reviewedPercent}%</strong></div>
            <div><span>Evidence types</span><strong>{stats.kinds}</strong></div>
          </section>

          <section className="evidence-review-progress" aria-label={`${reviewedPercent}% of evidence reviewed`}>
            <div><strong>Review progress</strong><span>{stats.reviewed.toLocaleString()} of {stats.total.toLocaleString()} classified</span></div>
            <div className="evidence-review-progress__track"><span style={{ width: `${reviewedPercent}%` }} /></div>
          </section>

          <div className="evidence-inbox-view-tabs" role="tablist" aria-label="Evidence views">
            {([['all', 'All evidence'], ['needs-review', 'Needs review'], ['recent', 'Recently added']] as const).map(([id, label]) => <button type="button" role="tab" aria-selected={view === id} className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}>{label}{id === "needs-review" ? <span>{stats.unreviewed}</span> : null}</button>)}
            {evidenceStatus === "loading" || statsStatus === "loading" ? <span className="evidence-inbox-view-tabs__sync"><LoaderCircle className="spin" size={13} />Refreshing evidence…</span> : null}
          </div>

          <EvidenceSavedViews
            views={savedViews}
            status={savedViewsStatus}
            activeId={activeSavedViewId}
            dirty={savedViewDirty}
            current={currentSavedView}
            projects={projects}
            pending={savedViewPending}
            notice={savedViewNotice}
            onApply={applySavedView}
            onSubmit={saveCurrentView}
            onDelete={removeSavedView}
            onRetry={() => { setSavedViewNotice(null); setSavedViewsRetryVersion((current) => current + 1); }}
          />

          <div className="evidence-inbox-toolbar">
            <label className="evidence-inbox-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search source text, notes, authors, topics, and tags" /></label>
            <select aria-label="Filter evidence by project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="all">All projects</option>{projects.map((project) => <option key={project.id} value={projectEvidenceId(project)}>{project.name}</option>)}</select>
            <select aria-label="Filter evidence by type" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as EvidenceInboxKindFilter)}><option value="all">All evidence types</option><option value="mention">Radar mentions</option><option value="research">Research & captures</option><option value="inspiration">Inspiration</option></select>
            <select aria-label="Sort evidence" value={sort} onChange={(event) => setSort(event.target.value as EvidenceInboxSort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="recently-reviewed">Recently reviewed</option><option value="source">Source A–Z</option><option value="project">Source project A–Z</option></select>
            <select aria-label="Group evidence" value={group} onChange={(event) => setGroup(event.target.value as EvidenceInboxGroup)}><option value="none">No grouping</option><option value="project">Group by source project</option><option value="kind">Group by type</option><option value="status">Group by status</option></select>
            {filtersActive ? <button className="evidence-inbox-clear" type="button" onClick={clearFilters}><X size={14} />Clear</button> : null}
          </div>

          {selectedItems.length ? <EvidenceBulkToolbar selectedCount={selectedItems.length} projects={projects} pending={bulkPending} feedback={bulkNotice} onReview={bulkReview} onTags={bulkTags} onAssignProject={bulkAssignProject} onClear={() => { setSelectedKeys(new Set()); setBulkNotice(null); }} /> : null}

          {statsStatus === "error" ? <div className="evidence-inbox-coverage-notice">Evidence is searchable, but the workspace totals could not be refreshed. Review counts will update on the next successful request.</div> : null}

          <div className="evidence-inbox-list" aria-live="polite">
            <div className="evidence-inbox-list__head">
              <label className="evidence-inbox-select"><input type="checkbox" aria-label="Select all visible evidence" checked={allVisibleSelected} onChange={toggleVisible} /></label>
              <div className="evidence-inbox-list__columns"><span>Evidence</span><span>Provenance</span><span>Source project</span><span>Captured</span><span>Status</span><span /></div>
            </div>
            {organized.map((section) => (
              <section className="evidence-inbox-group" aria-label={section.label || "Evidence"} key={section.id}>
                {section.label ? <div className="evidence-inbox-group__heading"><strong>{section.label}</strong><span>{section.items.length}</span></div> : null}
                {section.items.map((item) => {
                  const key = evidenceKey(item);
                  const associatedNames = item.associatedProjectIds.map((id) => projectNames.get(id)).filter((name): name is string => Boolean(name));
                  return (
                    <div className={`evidence-inbox-row${selectedKeys.has(key) ? " evidence-inbox-row--selected" : ""}`} key={key}>
                      <label className="evidence-inbox-select"><input type="checkbox" aria-label={`Select ${item.title}`} checked={selectedKeys.has(key)} onChange={() => toggleEvidence(key)} /></label>
                      <button type="button" className="evidence-inbox-row__open" onClick={() => openEvidence(item)}>
                        <span className={`evidence-inbox-row__kind evidence-inbox-row__kind--${item.kind}`}>{item.kind === "mention" ? "M" : item.kind === "research" ? "R" : "I"}</span>
                        <span className="evidence-inbox-row__copy"><strong>{highlight(item.title, query)}</strong><small>{highlight(item.excerpt ?? item.notes ?? "No excerpt preserved.", query)}</small>{item.organizationTags.length ? <span className="evidence-inbox-row__tags">{item.organizationTags.slice(0, 3).map((tag) => <em key={tag}>{tag}</em>)}</span> : null}</span>
                        <span className="evidence-inbox-row__provenance"><strong>{captureMethodLabel(item.provenance.captureMethod)}</strong><small>{item.sourceLabel}{item.author ? ` · ${item.author}` : ""}</small></span>
                        <span className="evidence-inbox-row__project"><strong>{projectNames.get(item.projectId) ?? "Project"}</strong>{associatedNames.length > 1 ? <small>+{associatedNames.length - 1} linked</small> : null}</span>
                        <span className="evidence-inbox-row__date">{formatDate(item.capturedAt)}</span>
                        <Badge className={`evidence-inbox-row__status evidence-inbox-row__status--${item.reviewStatus}`}>{evidenceReviewLabel(item.reviewStatus)}</Badge>
                        <ArrowRight className="evidence-inbox-row__arrow" size={15} />
                      </button>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>

          {items.length ? <div className="evidence-inbox-pagination"><span>{items.length.toLocaleString()} {items.length === 1 ? "item" : "items"} loaded from the server</span>{hasMore ? <Button onClick={loadNextPage} disabled={loadingMore}>{loadingMore ? <><LoaderCircle className="spin" size={14} />Loading…</> : "Load more"}</Button> : <strong>End of results</strong>}</div> : null}
          {pageError ? <div className="evidence-inbox-pagination evidence-inbox-pagination--error" role="alert"><span>{pageError}</span><Button onClick={loadNextPage}>Try again</Button></div> : null}
          {!items.length && evidenceStatus === "ready" ? <Card className="evidence-inbox-no-results"><Search size={24} /><div><strong>No evidence matched these filters.</strong><span>Try a broader phrase, another project, or all evidence types.</span></div><Button onClick={clearFilters}>Clear filters</Button></Card> : null}
        </>
      )}

      <EvidenceDetailDrawer evidence={selected} projectName={selected ? projectNames.get(selected.projectId) ?? "Project" : ""} associatedProjectNames={selected ? selected.associatedProjectIds.map((id) => projectNames.get(id)).filter((name): name is string => Boolean(name)) : []} assets={allAssets} relationships={relationships} relationshipStatus={relationshipStatus} relationshipError={relationshipError} onRetryRelationships={() => setRelationshipRetryVersion((current) => current + 1)} reviewPending={reviewPending} reviewError={reviewError} reviewSaved={reviewSaved} onReview={reviewEvidence} onClose={closeEvidence} />
    </div>
  );
}
