"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDashed, Eye, Lightbulb, LoaderCircle, Plus, Radar, RotateCcw, Search, XCircle } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { SignalDialog } from "@/components/signals/signal-dialog";
import { SignalDetailDrawer } from "@/components/signals/signal-detail-drawer";
import { Badge, Button, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import { createCloudSignal, listCloudSignals, updateCloudSignalStatus } from "@/lib/signals/repository";
import type { CreateSignalInput, SignalRecord, SignalStatus } from "@/lib/signals/types";

const statusLabels: Record<SignalStatus, string> = {
  candidate: "Candidate",
  watching: "Watching",
  promoted: "Promoted trend",
  dismissed: "Dismissed",
};

function kindLabel(kind: SignalRecord["kind"]) {
  if (kind === "hypothesis") return "Hypothesis";
  if (kind === "emerging_pattern") return "Emerging pattern";
  if (kind === "observed_trend") return "Observed trend";
  return "Working signal";
}

export function TrendsPage() {
  const { projects, activeProjectId, workspaceStatus, workspaceError, retryWorkspace, setProjectDialogOpen } = useApp();
  const projectIds = useMemo(() => projects.flatMap((project) => project.cloudId ? [project.cloudId] : []), [projects]);
  const activeCloudProjectId = projects.find((project) => project.id === activeProjectId)?.cloudId ?? projectIds[0] ?? "";
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [projectFilter, setProjectFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [selectedSignalId, setSelectedSignalId] = useState("");

  const loadSignals = useCallback(async () => {
    if (workspaceStatus !== "ready" || !projectIds.length) return;
    setLoading(true);
    setError("");
    try {
      setSignals(await listCloudSignals(projectIds));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Signals could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectIds, workspaceStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSignals(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSignals]);

  const projectNames = useMemo(() => new Map(projects.flatMap((project) => project.cloudId ? [[project.cloudId, project.name] as const] : [])), [projects]);
  const visibleSignals = projectFilter === "all" ? signals : signals.filter((signal) => signal.projectId === projectFilter);
  const activeCount = visibleSignals.filter((signal) => signal.status !== "dismissed").length;
  const watchingCount = visibleSignals.filter((signal) => signal.status === "watching").length;
  const evidenceCount = visibleSignals.reduce((total, signal) => total + signal.evidenceCounts.support + signal.evidenceCounts.contradict + signal.evidenceCounts.context, 0);
  const selectedSignal = signals.find((signal) => signal.id === selectedSignalId) ?? null;

  async function createSignal(input: CreateSignalInput) {
    const created = await createCloudSignal(input);
    setSignals((current) => [created, ...current]);
  }

  async function changeStatus(signal: SignalRecord, status: SignalStatus) {
    setUpdatingId(signal.id);
    setError("");
    try {
      const updated = await updateCloudSignalStatus(signal.id, status);
      setSignals((current) => current.map((item) => item.id === signal.id ? { ...updated, evidenceCounts: item.evidenceCounts, latestSnapshot: item.latestSnapshot } : item));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Signal status could not be changed.");
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <div className="page signals-page">
      <PageIntro eyebrow="Signals / trend intelligence" title="Notice change before naming a trend." description="Capture a working observation, test it against evidence, and promote it only when the collected material can support the claim.">
        {projects.length ? <Button variant="dark" onClick={() => setDialogOpen(true)}><Plus size={16} />New candidate</Button> : <Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={16} />Create project</Button>}
      </PageIntro>

      <section className="signal-method" aria-label="Signal method">
        <div><span>01</span><strong>Candidate</strong><small>Record what you noticed without overstating it.</small></div><ArrowRight size={17} />
        <div><span>02</span><strong>Watching</strong><small>Add support, context, and contradictory evidence.</small></div><ArrowRight size={17} />
        <div><span>03</span><strong>Promoted trend</strong><small>Advance only after scope and strength are visible.</small></div>
      </section>

      {workspaceStatus === "loading" && !projects.length ? (
        <EmptyState icon={LoaderCircle} title="Loading your workspace…" description="Sift is checking your private projects before loading signals." />
      ) : workspaceStatus === "error" && !projects.length ? (
        <EmptyState icon={XCircle} title="Your workspace could not be loaded." description={workspaceError || "Sift could not verify your private projects."} actions={<Button variant="dark" onClick={retryWorkspace}>Try again</Button>} />
      ) : !projects.length ? (
        <EmptyState icon={Radar} title="Create a project before tracking signals." description="Signals stay scoped to a real strategic question, market, and evidence base." actions={<Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create your first project</Button>} />
      ) : (
        <>
          <div className="signals-toolbar">
            <div className="signals-summary"><span><strong>{activeCount}</strong> active</span><span><strong>{watchingCount}</strong> watching</span><span><strong>{evidenceCount}</strong> evidence links</span></div>
            <label><span>Project</span><select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="all">All projects</option>{projects.flatMap((project) => project.cloudId ? [<option key={project.cloudId} value={project.cloudId}>{project.name}</option>] : [])}</select></label>
          </div>
          {error ? <div className="signals-error" role="alert"><XCircle size={16} /><span>{error}</span></div> : null}
          {loading ? (
            <div className="signals-loading"><LoaderCircle className="spin" size={18} />Loading signals…</div>
          ) : !visibleSignals.length ? (
            <EmptyState icon={CircleDashed} title={projectFilter === "all" ? "No signals recorded yet." : "No signals in this project yet."} description="Begin with a specific observation or a hypothesis worth testing. Sift will keep it separate from established findings." actions={<><Button variant="dark" onClick={() => setDialogOpen(true)}><Plus size={15} />Record a candidate</Button><Link className="ui-button ui-button--secondary ui-button--md" href="/evidence">Review evidence</Link></>} />
          ) : (
            <div className="signal-list">
              {visibleSignals.map((signal) => {
                const totalEvidence = signal.evidenceCounts.support + signal.evidenceCounts.contradict + signal.evidenceCounts.context;
                const pending = updatingId === signal.id;
                return <article className={`signal-card signal-card--${signal.status}`} key={signal.id}>
                  <header><div><div className="signal-card__labels"><Badge>{kindLabel(signal.kind)}</Badge><Badge className={`signal-status signal-status--${signal.status}`}>{statusLabels[signal.status]}</Badge></div><h2>{signal.title}</h2><p>{signal.observation}</p></div><span className="signal-card__project">{projectNames.get(signal.projectId) ?? "Project"}</span></header>
                  <div className="signal-card__scope"><Eye size={15} /><div><strong>Scope of this claim</strong><p>{signal.scopeNote}</p></div></div>
                  <div className="signal-card__assessment">
                    <div><span>Supporting</span><strong>{signal.evidenceCounts.support}</strong></div><div><span>Contradicting</span><strong>{signal.evidenceCounts.contradict}</strong></div><div><span>Context</span><strong>{signal.evidenceCounts.context}</strong></div><div><span>Assessment</span><strong>{signal.latestSnapshot ? `${signal.latestSnapshot.strengthScore}/100` : "Not assessed"}</strong></div>
                  </div>
                  <footer><div>{totalEvidence ? <span><CheckCircle2 size={14} />{totalEvidence} connected {totalEvidence === 1 ? "source" : "sources"}</span> : <span className="signal-card__needs-evidence"><Lightbulb size={14} />Needs evidence before interpretation</span>}<Button size="sm" onClick={() => setSelectedSignalId(signal.id)}><Search size={13} />Open analysis</Button></div><div className="signal-card__actions">{signal.status === "candidate" ? <Button size="sm" variant="dark" disabled={pending} onClick={() => void changeStatus(signal, "watching")}>{pending ? "Saving…" : "Start watching"}</Button> : null}{signal.status === "watching" ? <><Button size="sm" disabled={pending} onClick={() => void changeStatus(signal, "candidate")}><RotateCcw size={13} />Candidate</Button><Button size="sm" disabled={pending} onClick={() => void changeStatus(signal, "dismissed")}>Dismiss</Button></> : null}{signal.status === "dismissed" ? <Button size="sm" disabled={pending} onClick={() => void changeStatus(signal, "candidate")}><RotateCcw size={13} />Reopen</Button> : null}</div></footer>
                </article>;
              })}
            </div>
          )}
        </>
      )}
      <SignalDialog key={`${dialogOpen}-${activeCloudProjectId}`} open={dialogOpen} projects={projects} initialProjectId={activeCloudProjectId} onClose={() => setDialogOpen(false)} onCreate={createSignal} />
      <SignalDetailDrawer key={selectedSignal?.id ?? "closed-signal"} signal={selectedSignal} projectName={selectedSignal ? projectNames.get(selectedSignal.projectId) ?? "Project" : "Project"} projectSignals={selectedSignal ? signals.filter((signal) => signal.projectId === selectedSignal.projectId) : []} onClose={() => setSelectedSignalId("")} onUpdated={loadSignals} />
    </div>
  );
}
