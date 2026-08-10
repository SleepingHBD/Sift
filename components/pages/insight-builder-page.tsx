"use client";

import { ArrowRight, BookOpen, CheckCircle2, Layers3, LoaderCircle, LockKeyhole, Plus, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { StrategySourceDrawer } from "@/components/strategy-pipeline/source-drawer";
import { StrategySourcePanel } from "@/components/strategy-pipeline/source-panel";
import { StrategyStageCard } from "@/components/strategy-pipeline/stage-card";
import { StrategyStageTraceability } from "@/components/strategy-pipeline/stage-traceability";
import { Badge, Button, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import type { EvidenceReference } from "@/lib/evidence/reference";
import { searchEvidencePage } from "@/lib/evidence/search";
import { listCloudSignals } from "@/lib/signals/repository";
import type { SignalRecord } from "@/lib/signals/types";
import { STRATEGY_STAGE_DEFINITIONS, stageDefinition, stageProgress } from "@/lib/strategy-pipeline/model";
import {
  addStrategySessionInput,
  addStrategyDependency,
  attachStrategyEvidence,
  createStrategyAlternative,
  createStrategySession,
  listStrategyAiInputOptions,
  listStrategySessions,
  loadStrategySession,
  removeStrategyEvidence,
  removeStrategyDependency,
  saveStrategyStage,
  setStrategyStageStatus,
  updateStrategyAlternative,
  updateStrategyStageUncertainty,
} from "@/lib/strategy-pipeline/repository";
import type {
  CreateStrategyAlternativeInput,
  CreateStrategyDependencyInput,
  StrategyAiInputOption,
  StrategyConfidence,
  StrategySessionDetail,
  StrategySessionSummary,
  StrategySourceRelationship,
  StrategyStageKind,
  StrategyStageSourceRecord,
  StrategyStageStatus,
  UpdateStrategyAlternativeInput,
} from "@/lib/strategy-pipeline/types";

export function InsightBuilderPage() {
  const { projects, activeProjectId, setActiveProjectId, setProjectDialogOpen } = useApp();
  const cloudProjects = useMemo(() => projects.filter((project) => project.cloudId && project.status !== "archived"), [projects]);
  const [projectClientId, setProjectClientId] = useState("");
  const [sessions, setSessions] = useState<StrategySessionSummary[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<StrategySessionDetail | null>(null);
  const [evidence, setEvidence] = useState<EvidenceReference[]>([]);
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [aiInputs, setAiInputs] = useState<StrategyAiInputOption[]>([]);
  const [activeStage, setActiveStage] = useState<StrategyStageKind>("observation");
  const [drawerSource, setDrawerSource] = useState<StrategyStageSourceRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [error, setError] = useState("");
  const resolvedProjectClientId = cloudProjects.some((project) => project.id === projectClientId)
    ? projectClientId
    : (cloudProjects.find((project) => project.id === activeProjectId) ?? cloudProjects[0])?.id ?? "";
  const selectedProject = cloudProjects.find((project) => project.id === resolvedProjectClientId);
  const cloudProjectId = selectedProject?.cloudId ?? "";

  const loadProjectData = useCallback(async (projectId: string) => {
    setLoading(true);
    setSourceLoading(true);
    setError("");
    try {
      const [sessionRows, evidencePage, signalRows, aiRows] = await Promise.all([
        listStrategySessions(projectId),
        searchEvidencePage({ projectId, sort: "newest", pageSize: 50 }),
        listCloudSignals([projectId]),
        listStrategyAiInputOptions(projectId),
      ]);
      setSessions(sessionRows);
      setEvidence(evidencePage.items);
      setSignals(signalRows);
      setAiInputs(aiRows);
      setSessionId((current) => sessionRows.some((item) => item.id === current) ? current : sessionRows[0]?.id ?? "");
      if (!sessionRows.length) setSession(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The Insight Builder could not be loaded.");
      setSessions([]);
      setSession(null);
    } finally {
      setLoading(false);
      setSourceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cloudProjectId) return;
    let active = true;
    queueMicrotask(() => { if (active) void loadProjectData(cloudProjectId); });
    return () => { active = false; };
  }, [cloudProjectId, loadProjectData]);

  const reloadSession = useCallback(async () => {
    if (!sessionId || !cloudProjectId) return;
    const detail = await loadStrategySession(sessionId, cloudProjectId);
    setSession(detail);
    setSessions((current) => current.map((item) => item.id === detail.id ? { ...item, origin: detail.origin, updatedAt: detail.updatedAt } : item));
  }, [cloudProjectId, sessionId]);

  useEffect(() => {
    if (!sessionId || !cloudProjectId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError("");
      loadStrategySession(sessionId, cloudProjectId)
        .then((detail) => { if (active) setSession(detail); })
        .catch((loadError) => { if (active) { setSession(null); setError(loadError instanceof Error ? loadError.message : "This insight session could not be loaded."); } })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [cloudProjectId, sessionId]);

  function changeProject(value: string) {
    setProjectClientId(value);
    setSessionId("");
    setSession(null);
    setDrawerSource(null);
    setActiveProjectId(value);
  }

  async function saveStage(kind: StrategyStageKind, content: string) {
    if (!session || !cloudProjectId) throw new Error("Choose an insight session first.");
    const definition = stageDefinition(kind);
    const existing = session.stages.find((stage) => stage.kind === kind);
    await saveStrategyStage({
      id: existing?.id,
      sessionId: session.id,
      projectId: cloudProjectId,
      kind,
      content,
      claimType: existing?.claimType ?? definition.claimType,
      position: definition.position,
      confidence: existing?.confidence ?? "medium",
      researchGaps: existing?.researchGaps ?? [],
    });
    await reloadSession();
  }

  async function attachEvidence(item: EvidenceReference, relationship: StrategySourceRelationship) {
    if (!session || !cloudProjectId) throw new Error("Choose an insight session first.");
    const stage = session.stages.find((candidate) => candidate.kind === activeStage);
    if (!stage) throw new Error(`Save the ${stageDefinition(activeStage).label} claim before linking evidence.`);
    await attachStrategyEvidence({ projectId: cloudProjectId, stageId: stage.id, evidence: item, relationship });
    await reloadSession();
  }

  async function removeEvidence(link: StrategyStageSourceRecord) {
    if (!cloudProjectId) return;
    await removeStrategyEvidence(link.id, cloudProjectId, link.stageId);
    if (drawerSource?.id === link.id) setDrawerSource(null);
    await reloadSession();
  }

  async function saveUncertainty(stageId: string, confidence: StrategyConfidence, gaps: string[]) {
    if (!cloudProjectId) throw new Error("Choose a project first.");
    await updateStrategyStageUncertainty(stageId, cloudProjectId, confidence, gaps);
    await reloadSession();
  }

  async function changeStageStatus(stageId: string, status: StrategyStageStatus, note?: string) {
    if (!cloudProjectId) throw new Error("Choose a project first.");
    await setStrategyStageStatus(stageId, cloudProjectId, status, note);
    await reloadSession();
  }

  async function addAlternative(stageId: string, input: Omit<CreateStrategyAlternativeInput, "projectId" | "stageId">) {
    if (!cloudProjectId) throw new Error("Choose a project first.");
    await createStrategyAlternative({ ...input, projectId: cloudProjectId, stageId });
    await reloadSession();
  }

  async function saveAlternative(stageId: string, input: Omit<UpdateStrategyAlternativeInput, "projectId" | "stageId">) {
    if (!cloudProjectId) throw new Error("Choose a project first.");
    await updateStrategyAlternative({ ...input, projectId: cloudProjectId, stageId });
    await reloadSession();
  }

  async function addDependency(stageId: string, input: Omit<CreateStrategyDependencyInput, "projectId" | "stageId">) {
    if (!cloudProjectId) throw new Error("Choose a project first.");
    await addStrategyDependency({ ...input, projectId: cloudProjectId, stageId });
    await reloadSession();
  }

  async function removeDependency(stageId: string, dependencyId: string) {
    if (!cloudProjectId) throw new Error("Choose a project first.");
    await removeStrategyDependency(dependencyId, cloudProjectId, stageId);
    await reloadSession();
  }

  async function addInput(type: "signal" | "ai_message", id: string) {
    if (!session) throw new Error("Choose an insight session first.");
    await addStrategySessionInput(session, type, id);
    const [detail, sessionRows] = await Promise.all([
      loadStrategySession(session.id, session.projectId),
      listStrategySessions(session.projectId),
    ]);
    setSession(detail);
    setSessions(sessionRows);
  }

  async function searchEvidence(search: string) {
    if (!cloudProjectId) return;
    setSourceLoading(true);
    try {
      const page = await searchEvidencePage({ projectId: cloudProjectId, search, sort: "newest", pageSize: 50 });
      setEvidence(page.items);
    } finally { setSourceLoading(false); }
  }

  async function createSession(title: string) {
    if (!cloudProjectId) throw new Error("Choose a project first.");
    const created = await createStrategySession(cloudProjectId, title);
    setSessions((current) => [created, ...current]);
    setSessionId(created.id);
    setCreating(false);
  }

  if (!cloudProjects.length) {
    return (
      <div className="page">
        <PageIntro eyebrow="Think / Insight Builder" title="Turn evidence into an argument." description="Build an editable path from what you observed to the strategic opportunity it creates." />
        <EmptyState icon={Layers3} eyebrow="Project required" title="Your first insight needs a project." description="Projects keep evidence, Signals, AI analysis, and strategic thinking inside one private context." actions={<Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} /> Create project</Button>} />
      </div>
    );
  }

  return (
    <div className="page insight-builder-page">
      <PageIntro eyebrow="Think / Insight Builder" title="Turn evidence into an argument." description="Move carefully from observation to opportunity. Every claim stays editable, and original evidence remains traceable.">
        <Button variant="dark" onClick={() => setCreating(true)}><Plus size={15} /> New insight session</Button>
      </PageIntro>

      <section className="insight-builder-toolbar" aria-label="Insight workspace selection">
        <label><span>Project</span><select value={resolvedProjectClientId} onChange={(event) => changeProject(event.target.value)}>{cloudProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <ArrowRight size={16} />
        <label><span>Insight session</span><select value={sessionId} disabled={!sessions.length} onChange={(event) => setSessionId(event.target.value)}>{sessions.length ? sessions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>) : <option value="">No sessions yet</option>}</select></label>
        {session ? <div className="insight-builder-toolbar__progress"><span>{stageProgress(session.stages.map((stage) => stage.kind))}/5 stages saved</span><i><b style={{ width: `${stageProgress(session.stages.map((stage) => stage.kind)) * 20}%` }} /></i></div> : null}
      </section>

      {error ? <div className="insight-builder-error" role="alert"><strong>Insight Builder needs attention.</strong><span>{error}</span><Button size="sm" onClick={() => cloudProjectId && void loadProjectData(cloudProjectId)}>Try again</Button></div> : null}

      {loading && !session ? <div className="insight-builder-loading"><LoaderCircle className="spin" size={22} /><div><strong>Loading your strategy workspace</strong><span>Retrieving sessions and source relationships from Supabase…</span></div></div> : null}

      {!loading && !sessions.length && !error ? (
        <EmptyState icon={BookOpen} eyebrow="No insight sessions" title="Start with a question worth resolving." description="Create a session, record what you observed, then link the original evidence that supports or challenges it." actions={<Button variant="dark" onClick={() => setCreating(true)}><Plus size={15} /> Create first insight session</Button>} />
      ) : null}

      {session ? (
        <>
          <section className="insight-session-context">
            <div><p className="eyebrow">Current argument</p><h2>{session.title}</h2><p>Created by you · {session.origin.replaceAll("_", " ")}</p></div>
            <div className="insight-session-context__inputs">
              {session.inputs.length ? session.inputs.map((input) => <span key={input.id}><Badge>{input.inputType === "signal" ? "Signal" : "AI provenance"}</Badge><strong>{input.title}</strong></span>) : <span><Badge>Strategist led</Badge><strong>No analytical starting points added</strong></span>}
            </div>
          </section>

          <div className="insight-builder-layout">
            <main className="insight-pipeline" aria-label="Insight reasoning stages">
              {STRATEGY_STAGE_DEFINITIONS.map((definition) => {
                const record = session.stages.find((stage) => stage.kind === definition.kind);
                return (
                <StrategyStageCard
                  key={`${session.id}:${definition.kind}:${record?.updatedAt ?? "new"}`}
                  kind={definition.kind}
                  record={record}
                  active={activeStage === definition.kind}
                  onActivate={() => setActiveStage(definition.kind)}
                  onSave={saveStage}
                  onOpenSource={setDrawerSource}
                  onRemoveSource={removeEvidence}
                  renderTraceability={record ? (hasUnsavedClaimChanges) => (
                    <StrategyStageTraceability
                      record={record}
                      stages={session.stages}
                      hasUnsavedClaimChanges={hasUnsavedClaimChanges}
                      onSaveUncertainty={(confidence, gaps) => saveUncertainty(record.id, confidence, gaps)}
                      onSetStatus={(status, note) => changeStageStatus(record.id, status, note)}
                      onCreateAlternative={(input) => addAlternative(record.id, input)}
                      onUpdateAlternative={(input) => saveAlternative(record.id, input)}
                      onAddDependency={(input) => addDependency(record.id, input)}
                      onRemoveDependency={(dependencyId) => removeDependency(record.id, dependencyId)}
                    />
                  ) : undefined}
                />
                );
              })}
              <section className="insight-proposition-lock"><span><LockKeyhole size={18} /></span><div><p className="eyebrow">Next stage</p><h2>Strategic Proposition</h2><p>This remains locked until the Opportunity is explicit and the Phase 7 evidence trail has passed its acceptance checkpoint.</p></div><Badge>Locked</Badge></section>
            </main>
            <StrategySourcePanel
              session={session}
              activeStage={activeStage}
              activeStageSaved={session.stages.some((stage) => stage.kind === activeStage)}
              evidence={evidence}
              signals={signals}
              aiInputs={aiInputs}
              loading={sourceLoading}
              onSearch={searchEvidence}
              onAttachEvidence={attachEvidence}
              onAddInput={addInput}
            />
          </div>
          <div className="insight-builder-boundary"><CheckCircle2 size={17} /><p><strong>You remain the author.</strong> Sift stores your reasoning and source relationships. Signals and Strategy AI can inform the work, but they do not become evidence or silently write claims.</p></div>
        </>
      ) : null}

      <NewInsightSessionDialog open={creating} onClose={() => setCreating(false)} onCreate={createSession} />
      <StrategySourceDrawer source={drawerSource} onClose={() => setDrawerSource(null)} />
    </div>
  );
}

function NewInsightSessionDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) { setError("Give this insight session a clear working title."); return; }
    setPending(true); setError("");
    try { await onCreate(title); setTitle(""); }
    catch (createError) { setError(createError instanceof Error ? createError.message : "The session could not be created."); }
    finally { setPending(false); }
  }
  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="new-insight-title">
      <button className="radar-overlay__scrim" disabled={pending} onClick={onClose} aria-label="Close" />
      <form className="workspace-dialog workspace-dialog--small" onSubmit={submit}>
        <header><div><span className="workspace-dialog__icon"><Layers3 size={19} /></span><div><p className="eyebrow">New insight session</p><h2 id="new-insight-title">Name the argument you are developing.</h2><p>This can be a research question, audience tension, or strategic problem. It is not the final insight.</p></div></div><button type="button" disabled={pending} onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="workspace-dialog__body"><label><span>Working title *</span><input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Why this behaviour is changing now" /><small className="field-help">Use a title you will recognise when several investigations exist in the same project.</small></label>{error ? <p className="form-error" role="alert">{error}</p> : null}</div>
        <footer><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="dark" disabled={pending || !title.trim()}>{pending ? <><LoaderCircle className="spin" size={15} /> Creating…</> : "Create session"}</Button></footer>
      </form>
    </div>
  );
}
