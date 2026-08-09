"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Circle, Edit3, GitMerge, History, LoaderCircle, ShieldCheck, Split, Tag, XCircle } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import {
  ensureSignalTopic,
  listSignalLineage,
  listSignalRevisions,
  listSignalTopics,
  mergeCloudSignals,
  promoteCloudSignal,
  splitCloudSignal,
  updateCloudSignal,
} from "@/lib/signals/repository";
import { signalPromotionGate } from "@/lib/signals/promotion";
import type {
  SignalEvidenceLink,
  SignalLineageRecord,
  SignalRecord,
  SignalRevisionRecord,
  SignalSnapshotRecord,
  SignalTopicOption,
  UpdateSignalInput,
} from "@/lib/signals/types";

type ManagementMode = "edit" | "merge" | "split" | "promote" | null;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function kindLabel(kind: SignalRecord["kind"]) {
  if (kind === "hypothesis") return "Hypothesis to test";
  if (kind === "emerging_pattern") return "Emerging pattern";
  if (kind === "observed_trend") return "Observed trend";
  return "Working signal";
}

interface SignalManagementPanelProps {
  signal: SignalRecord;
  projectSignals: SignalRecord[];
  links: SignalEvidenceLink[];
  snapshots: SignalSnapshotRecord[];
  onUpdated: () => Promise<void> | void;
}

export function SignalManagementPanel({ signal, projectSignals, links, snapshots, onUpdated }: SignalManagementPanelProps) {
  const [mode, setMode] = useState<ManagementMode>(null);
  const [topics, setTopics] = useState<SignalTopicOption[]>([]);
  const [revisions, setRevisions] = useState<SignalRevisionRecord[]>([]);
  const [lineage, setLineage] = useState<SignalLineageRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [edit, setEdit] = useState<UpdateSignalInput>({
    title: signal.title,
    observation: signal.observation,
    kind: signal.kind === "observed_trend" ? "emerging_pattern" : signal.kind,
    scopeNote: signal.scopeNote,
    strategistNotes: signal.strategistNotes,
    topicId: signal.topicId,
  });
  const [newTopic, setNewTopic] = useState("");
  const [mergeIds, setMergeIds] = useState<string[]>([]);
  const [splitLinkIds, setSplitLinkIds] = useState<string[]>([]);
  const [splitTitle, setSplitTitle] = useState(`${signal.title} — focused signal`);
  const [splitObservation, setSplitObservation] = useState(signal.observation);
  const [splitKind, setSplitKind] = useState<UpdateSignalInput["kind"]>(signal.kind === "hypothesis" ? "hypothesis" : "signal");
  const [splitScope, setSplitScope] = useState(signal.scopeNote);
  const [splitNotes, setSplitNotes] = useState("");
  const [moveEvidence, setMoveEvidence] = useState(true);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const [topicRows, revisionRows, lineageRows] = await Promise.all([
        listSignalTopics(signal.projectId),
        listSignalRevisions(signal.id, signal.projectId),
        listSignalLineage(signal.id, signal.projectId),
      ]);
      setTopics(topicRows);
      setRevisions(revisionRows);
      setLineage(lineageRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Signal controls could not be loaded.");
    } finally {
      setAuditLoading(false);
    }
  }, [signal.id, signal.projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAudit(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAudit]);

  const signalNames = useMemo(() => new Map(projectSignals.map((item) => [item.id, item.title])), [projectSignals]);
  const mergeCandidates = projectSignals.filter((item) => item.id !== signal.id && item.status !== "promoted" && !item.supersededBySignalId);
  const latestSnapshot = snapshots[0] ?? null;
  const gate = signalPromotionGate(signal, latestSnapshot);
  const locked = signal.status === "promoted" || Boolean(signal.supersededBySignalId);

  function open(next: Exclude<ManagementMode, null>) {
    setMode((current) => current === next ? null : next);
    setError("");
    setNotice("");
  }

  async function refreshAfterMutation(message: string) {
    await onUpdated();
    await loadAudit();
    setMode(null);
    setNotice(message);
  }

  async function saveEdit() {
    if (!edit.title.trim() || !edit.observation.trim() || !edit.scopeNote.trim()) {
      setError("Title, observed claim, and evidence scope are required.");
      return;
    }
    setPending(true);
    setError("");
    try {
      let topicId = edit.topicId;
      if (newTopic.trim()) {
        const topic = await ensureSignalTopic(signal.projectId, newTopic);
        topicId = topic.id;
        setNewTopic("");
      }
      await updateCloudSignal(signal.id, signal.projectId, { ...edit, topicId });
      await refreshAfterMutation("Signal corrected. The previous version remains in its history.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Signal could not be updated.");
    } finally { setPending(false); }
  }

  async function merge() {
    if (!mergeIds.length) { setError("Choose at least one signal to merge into this one."); return; }
    setPending(true);
    setError("");
    try {
      await mergeCloudSignals(signal.id, mergeIds);
      setMergeIds([]);
      await refreshAfterMutation("Signals merged. Their original records and lineage remain inspectable.");
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : "Signals could not be merged.");
    } finally { setPending(false); }
  }

  async function splitSignal() {
    if (!splitLinkIds.length) { setError("Choose at least one evidence source for the new signal."); return; }
    if (!splitTitle.trim() || !splitObservation.trim() || !splitScope.trim()) {
      setError("The new signal needs a title, observed claim, and evidence scope.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await splitCloudSignal({
        sourceSignalId: signal.id,
        evidenceLinkIds: splitLinkIds,
        title: splitTitle,
        observation: splitObservation,
        kind: splitKind,
        scopeNote: splitScope,
        strategistNotes: splitNotes,
        moveEvidence,
      });
      setSplitLinkIds([]);
      await refreshAfterMutation("New signal created with explicit split provenance.");
    } catch (splitError) {
      setError(splitError instanceof Error ? splitError.message : "Signal could not be split.");
    } finally { setPending(false); }
  }

  async function promote() {
    if (!gate.eligible) return;
    setPending(true);
    setError("");
    try {
      await promoteCloudSignal(signal.id);
      await refreshAfterMutation("Signal promoted to an observed trend with its assessment and evidence trail attached.");
    } catch (promotionError) {
      setError(promotionError instanceof Error ? promotionError.message : "Signal could not be promoted.");
    } finally { setPending(false); }
  }

  return (
    <section className="signal-detail__section signal-management" aria-labelledby="signal-management-heading">
      <div className="signal-detail__section-heading">
        <div><p className="drawer-section-label" id="signal-management-heading">Signal controls</p><span>Correct the claim, preserve provenance, and review explicit promotion requirements.</span></div>
        {auditLoading ? <LoaderCircle className="spin" size={15} /> : <Badge>{revisions.length} changes</Badge>}
      </div>

      {locked ? <div className="signal-management__locked"><ShieldCheck size={16} /><span>{signal.status === "promoted" ? "This signal is now linked to an observed trend. Its analytical record is preserved." : "This signal was superseded by a merge and remains available as provenance."}</span></div> : null}
      {notice ? <div className="signal-management__notice" role="status"><Check size={15} />{notice}</div> : null}
      {error ? <div className="signal-management__error" role="alert"><XCircle size={15} />{error}</div> : null}

      <div className="signal-management__actions">
        <Button size="sm" disabled={locked || pending} onClick={() => open("edit")}><Edit3 size={13} />Correct</Button>
        <Button size="sm" disabled={locked || pending || !mergeCandidates.length} onClick={() => open("merge")}><GitMerge size={13} />Merge</Button>
        <Button size="sm" disabled={locked || pending || !links.length} onClick={() => open("split")}><Split size={13} />Split</Button>
        <Button size="sm" variant="dark" disabled={locked || pending} onClick={() => open("promote")}><ShieldCheck size={13} />Promotion review</Button>
      </div>

      {mode === "edit" ? <div className="signal-management__panel signal-management__edit">
        <div className="signal-management__panel-heading"><strong>Correct this working signal</strong><span>Saving creates an immutable before/after revision.</span></div>
        <label><span>Signal title</span><input maxLength={200} value={edit.title} onChange={(event) => setEdit((current) => ({ ...current, title: event.target.value }))} /></label>
        <label><span>Observed claim</span><textarea rows={4} maxLength={5000} value={edit.observation} onChange={(event) => setEdit((current) => ({ ...current, observation: event.target.value }))} /></label>
        <div className="signal-management__grid"><label><span>Analytical type</span><select value={edit.kind} onChange={(event) => setEdit((current) => ({ ...current, kind: event.target.value as UpdateSignalInput["kind"] }))}><option value="signal">Working signal</option><option value="emerging_pattern">Emerging pattern</option><option value="hypothesis">Hypothesis to test</option></select></label><label><span>Existing topic</span><select value={edit.topicId ?? ""} onChange={(event) => setEdit((current) => ({ ...current, topicId: event.target.value || null }))}><option value="">No topic assigned</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label></div>
        <label><span>Or create a topic <small>Optional; this becomes the assigned topic</small></span><input maxLength={60} value={newTopic} onChange={(event) => setNewTopic(event.target.value)} placeholder="e.g. Community-first fitness" /></label>
        <label><span>Evidence scope</span><textarea rows={3} maxLength={1000} value={edit.scopeNote} onChange={(event) => setEdit((current) => ({ ...current, scopeNote: event.target.value }))} /></label>
        <label><span>Strategist notes</span><textarea rows={3} maxLength={10000} value={edit.strategistNotes} onChange={(event) => setEdit((current) => ({ ...current, strategistNotes: event.target.value }))} placeholder="Questions, caveats, or what to investigate next" /></label>
        <div className="signal-management__panel-actions"><Button size="sm" onClick={() => setMode(null)}>Cancel</Button><Button size="sm" variant="dark" disabled={pending} onClick={() => void saveEdit()}>{pending ? <LoaderCircle className="spin" size={13} /> : <Edit3 size={13} />}Save correction</Button></div>
      </div> : null}

      {mode === "merge" ? <div className="signal-management__panel">
        <div className="signal-management__panel-heading"><strong>Merge into “{signal.title}”</strong><span>Evidence is copied here. Source signals are dismissed, not deleted.</span></div>
        <div className="signal-management__choices">{mergeCandidates.map((candidate) => <label key={candidate.id} aria-label={`Merge ${candidate.title}`} className={mergeIds.includes(candidate.id) ? "active" : ""}><input type="checkbox" checked={mergeIds.includes(candidate.id)} onChange={() => setMergeIds((current) => current.includes(candidate.id) ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])} /><span><strong>{candidate.title}</strong><small>{kindLabel(candidate.kind)} · {candidate.evidenceCounts.support + candidate.evidenceCounts.contradict + candidate.evidenceCounts.context} evidence links</small></span></label>)}</div>
        <div className="signal-management__panel-actions"><Button size="sm" onClick={() => setMode(null)}>Cancel</Button><Button size="sm" variant="dark" disabled={pending || !mergeIds.length} onClick={() => void merge()}>{pending ? <LoaderCircle className="spin" size={13} /> : <GitMerge size={13} />}Merge {mergeIds.length || ""}</Button></div>
      </div> : null}

      {mode === "split" ? <div className="signal-management__panel signal-management__edit">
        <div className="signal-management__panel-heading"><strong>Split selected evidence into a new signal</strong><span>The new signal will retain a visible link back to this one.</span></div>
        <label><span>New signal title</span><input maxLength={200} value={splitTitle} onChange={(event) => setSplitTitle(event.target.value)} /></label>
        <label><span>New observed claim</span><textarea rows={3} maxLength={5000} value={splitObservation} onChange={(event) => setSplitObservation(event.target.value)} /></label>
        <div className="signal-management__grid"><label><span>Analytical type</span><select value={splitKind} onChange={(event) => setSplitKind(event.target.value as UpdateSignalInput["kind"])}><option value="signal">Working signal</option><option value="emerging_pattern">Emerging pattern</option><option value="hypothesis">Hypothesis to test</option></select></label><label><span>Evidence handling</span><select value={moveEvidence ? "move" : "copy"} onChange={(event) => setMoveEvidence(event.target.value === "move")}><option value="move">Move to new signal</option><option value="copy">Keep linked to both</option></select></label></div>
        <label><span>Evidence scope</span><textarea rows={2} maxLength={1000} value={splitScope} onChange={(event) => setSplitScope(event.target.value)} /></label>
        <label><span>Strategist notes</span><textarea rows={2} maxLength={10000} value={splitNotes} onChange={(event) => setSplitNotes(event.target.value)} /></label>
        <fieldset className="signal-management__evidence-choices"><legend>Choose evidence for the new signal</legend>{links.map((link) => <label key={link.id} aria-label={`Include ${link.source.title}`} className={splitLinkIds.includes(link.id) ? "active" : ""}><input type="checkbox" checked={splitLinkIds.includes(link.id)} onChange={() => setSplitLinkIds((current) => current.includes(link.id) ? current.filter((id) => id !== link.id) : [...current, link.id])} /><span><strong>{link.source.title}</strong><small>{link.relationship} · {link.source.sourceLabel}</small></span></label>)}</fieldset>
        <div className="signal-management__panel-actions"><Button size="sm" onClick={() => setMode(null)}>Cancel</Button><Button size="sm" variant="dark" disabled={pending || !splitLinkIds.length} onClick={() => void splitSignal()}>{pending ? <LoaderCircle className="spin" size={13} /> : <Split size={13} />}Create split signal</Button></div>
      </div> : null}

      {mode === "promote" ? <div className="signal-management__panel signal-promotion-review">
        <div className="signal-management__panel-heading"><strong>Promotion review</strong><span>Sift checks the latest assessment; you still make the final decision.</span></div>
        <ul>{gate.requirements.map((requirement) => <li key={requirement.id} className={requirement.met ? "met" : "unmet"}>{requirement.met ? <Check size={14} /> : <Circle size={14} />}<span><strong>{requirement.label}</strong><small>{requirement.met ? "Requirement met" : requirement.detail}</small></span></li>)}</ul>
        <div className="signal-promotion-review__boundary"><ShieldCheck size={15} /><span>Promotion creates an emerging Trend linked to this exact assessment and its supporting Radar mentions. It does not claim population-level truth.</span></div>
        <div className="signal-management__panel-actions"><Button size="sm" onClick={() => setMode(null)}>Close</Button><Button size="sm" variant="dark" disabled={pending || !gate.eligible} onClick={() => void promote()}>{pending ? <LoaderCircle className="spin" size={13} /> : <ShieldCheck size={13} />}{gate.eligible ? "Promote to observed trend" : "Requirements not met"}</Button></div>
      </div> : null}

      {revisions.length || lineage.length ? <details className="signal-management__history"><summary><History size={13} />Correction and lineage history ({revisions.length + lineage.length})</summary><div>{revisions.map((revision) => <article key={revision.id}><span><Badge>{revision.changeKind}</Badge><strong>{revision.changedFields.map((field) => field.replaceAll("_", " ")).join(", ")}</strong></span><time>{formatDate(revision.createdAt)}</time></article>)}{lineage.map((item) => { const otherId = item.sourceSignalId === signal.id ? item.targetSignalId : item.sourceSignalId; return <article key={item.id}><span><Badge>{item.relationship}</Badge><strong>{item.sourceSignalId === signal.id ? "Created" : "Contributed by"} “{signalNames.get(otherId) ?? "Related signal"}”</strong></span><time>{formatDate(item.createdAt)}</time></article>; })}</div></details> : null}
      {!auditLoading && !revisions.length && !lineage.length ? <p className="signal-management__no-history"><Tag size={13} />No corrections, merges, or splits recorded yet.</p> : null}
    </section>
  );
}
