"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, BookOpen, FileSearch, Image, Link2, LoaderCircle, MessageSquare, Plus, Save, Trash2, X } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { SignalAssessmentPanel } from "@/components/signals/signal-assessment-panel";
import { SignalManagementPanel } from "@/components/signals/signal-management-panel";
import {
  addSignalEvidence,
  createSignalSnapshot,
  listSignalEvidence,
  listSignalSnapshots,
  removeSignalEvidence,
  searchSignalEvidenceCandidates,
  updateSignalEvidence,
} from "@/lib/signals/repository";
import type { EvidenceReference } from "@/lib/evidence/reference";
import type { SignalEvidenceLink, SignalEvidenceRelationship, SignalRecord, SignalSnapshotRecord } from "@/lib/signals/types";

const relationshipLabels: Record<SignalEvidenceRelationship, string> = {
  support: "Supports",
  contradict: "Contradicts",
  context: "Adds context",
};

const excerptLabels = {
  source: "Preserved source text",
  interpretation: "Initial interpretation",
  notes: "Working strategist notes",
} as const;

function kindIcon(kind: EvidenceReference["kind"] | SignalEvidenceLink["source"]["kind"]) {
  if (kind === "mention") return MessageSquare;
  if (kind === "research") return BookOpen;
  return Image;
}

function sourceKey(kind: string, id: string) {
  return `${kind}:${id}`;
}

interface SignalDetailDrawerProps {
  signal: SignalRecord | null;
  projectName: string;
  projectSignals: SignalRecord[];
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
}

export function SignalDetailDrawer({ signal, projectName, projectSignals, onClose, onUpdated }: SignalDetailDrawerProps) {
  const [links, setLinks] = useState<SignalEvidenceLink[]>([]);
  const [snapshots, setSnapshots] = useState<SignalSnapshotRecord[]>([]);
  const [candidates, setCandidates] = useState<EvidenceReference[]>([]);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | EvidenceReference["kind"]>("all");
  const [selected, setSelected] = useState<EvidenceReference | null>(null);
  const [relationship, setRelationship] = useState<SignalEvidenceRelationship>("support");
  const [rationale, setRationale] = useState("");
  const [rationaleDrafts, setRationaleDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!signal) return;
    setStatus("loading");
    setError("");
    try {
      const [evidence, history] = await Promise.all([
        listSignalEvidence(signal.id, signal.projectId),
        listSignalSnapshots(signal.id, signal.projectId),
      ]);
      setLinks(evidence);
      setSnapshots(history);
      setRationaleDrafts(Object.fromEntries(evidence.map((link) => [link.id, link.rationale])));
      setStatus("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Signal details could not be loaded.");
      setStatus("error");
    }
  }, [signal]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!signal || status === "error") return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const items = await searchSignalEvidenceCandidates(signal.projectId, search);
        if (active) setCandidates(items);
      } catch (searchError) {
        if (active) setError(searchError instanceof Error ? searchError.message : "Evidence search failed.");
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, signal, status]);

  const linkedKeys = useMemo(() => new Set(links.map((link) => sourceKey(link.source.kind, link.source.id))), [links]);
  const visibleCandidates = candidates.filter((item) => kindFilter === "all" || item.kind === kindFilter).filter((item) => !linkedKeys.has(sourceKey(item.kind, item.id)));

  if (!signal) return null;
  const activeSignal = signal;
  const signalLocked = signal.status === "promoted" || Boolean(signal.supersededBySignalId);

  async function afterMutation() {
    await refresh();
    await onUpdated();
  }

  async function attach() {
    if (!selected) return;
    setPending("attach");
    setError("");
    try {
      await addSignalEvidence({ signalId: activeSignal.id, projectId: activeSignal.projectId, evidenceType: selected.kind, evidenceId: selected.id, relationship, rationale });
      setSelected(null);
      setRationale("");
      await afterMutation();
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : "Evidence could not be linked.");
    } finally { setPending(""); }
  }

  async function changeRelationship(link: SignalEvidenceLink, next: SignalEvidenceRelationship) {
    setPending(link.id);
    setError("");
    try { await updateSignalEvidence(link.id, activeSignal.id, activeSignal.projectId, { relationship: next }); await afterMutation(); }
    catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Evidence role could not be changed."); }
    finally { setPending(""); }
  }

  async function saveRationale(link: SignalEvidenceLink) {
    setPending(link.id);
    setError("");
    try { await updateSignalEvidence(link.id, activeSignal.id, activeSignal.projectId, { rationale: rationaleDrafts[link.id] ?? "" }); await afterMutation(); }
    catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Evidence rationale could not be saved."); }
    finally { setPending(""); }
  }

  async function remove(link: SignalEvidenceLink) {
    if (!window.confirm("Remove this source from the signal? The original evidence will remain in Sift.")) return;
    setPending(link.id);
    setError("");
    try { await removeSignalEvidence(link.id, activeSignal.id, activeSignal.projectId); await afterMutation(); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Evidence link could not be removed."); }
    finally { setPending(""); }
  }

  async function assess() {
    setPending("assessment");
    setError("");
    try {
      const created = await createSignalSnapshot(activeSignal.id, activeSignal.projectId, links, snapshots);
      setSnapshots((current) => [created, ...current]);
      await onUpdated();
    } catch (assessmentError) { setError(assessmentError instanceof Error ? assessmentError.message : "Assessment could not be created."); }
    finally { setPending(""); }
  }

  return (
    <div className="radar-overlay radar-overlay--drawer" role="dialog" aria-modal="true" aria-labelledby="signal-detail-title">
      <button className="radar-overlay__scrim" onClick={onClose} aria-label="Close signal detail" />
      <aside className="radar-drawer signal-detail-drawer">
        <header><div><p className="eyebrow">{signal.kind === "hypothesis" ? "Hypothesis to test" : "Working signal"}</p><h2 id="signal-detail-title">{signal.title}</h2><p>{projectName} · {signal.status}</p></div><button onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="signal-detail__claim"><p>{signal.observation}</p><div><AlertTriangle size={14} /><span><strong>Scope of this claim</strong>{signal.scopeNote}</span></div></div>
        {error ? <div className="signals-error signal-detail__error" role="alert"><AlertTriangle size={15} /><span>{error}</span>{status === "error" ? <button onClick={() => void refresh()}>Try again</button> : null}</div> : null}
        {status === "loading" ? <div className="signal-detail__loading"><LoaderCircle className="spin" size={18} />Loading evidence trail…</div> : null}
        {status === "ready" ? <>
          <SignalManagementPanel signal={signal} projectSignals={projectSignals} links={links} snapshots={snapshots} onUpdated={onUpdated} />
          <section className="signal-detail__section" aria-labelledby="linked-evidence-heading">
            <div className="signal-detail__section-heading"><div><p className="drawer-section-label" id="linked-evidence-heading">Evidence trail</p><span>Classify each source by what it contributes to the working claim.</span></div><Badge>{links.length} linked</Badge></div>
            {!links.length ? <div className="signal-detail__empty"><Link2 size={18} /><div><strong>No evidence linked yet.</strong><span>Search this project below and connect an original source.</span></div></div> : <div className="signal-evidence-list">{links.map((link) => {
              const Icon = kindIcon(link.source.kind);
              const draft = rationaleDrafts[link.id] ?? "";
              return <article key={link.id} className={`signal-evidence-item signal-evidence-item--${link.relationship}`}>
                <div className="signal-evidence-item__heading"><span className="signal-evidence-item__icon"><Icon size={15} /></span><div><Badge>{relationshipLabels[link.relationship]}</Badge><strong>{link.source.title}</strong><small>{link.source.sourceLabel}{link.source.author ? ` · ${link.source.author}` : ""}</small></div>{link.source.originalUrl ? <a href={link.source.originalUrl} target="_blank" rel="noreferrer" aria-label={`Open original source for ${link.source.title}`}><ArrowUpRight size={15} /></a> : null}</div>
                {link.source.excerpt ? <><span className="signal-evidence-item__excerpt-label">{link.source.excerptOrigin ? excerptLabels[link.source.excerptOrigin] : "Linked evidence"}</span><p>{link.source.excerpt}</p></> : <p className="signal-evidence-item__muted">No source excerpt was preserved.</p>}
                {!signalLocked ? <div className="signal-evidence-item__controls"><label><span>Role</span><select disabled={pending === link.id} value={link.relationship} onChange={(event) => void changeRelationship(link, event.target.value as SignalEvidenceRelationship)}><option value="support">Supports</option><option value="contradict">Contradicts</option><option value="context">Adds context</option></select></label><label><span>Why it belongs</span><textarea rows={2} maxLength={2000} disabled={pending === link.id} value={draft} onChange={(event) => setRationaleDrafts((current) => ({ ...current, [link.id]: event.target.value }))} placeholder="Optional: note exactly what this source contributes" /></label><div><Button size="sm" disabled={pending === link.id || draft.trim() === link.rationale} onClick={() => void saveRationale(link)}><Save size={13} />Save note</Button><Button size="icon" disabled={pending === link.id} onClick={() => void remove(link)} aria-label={`Remove ${link.source.title} from signal`}><Trash2 size={14} /></Button></div></div> : null}
              </article>;
            })}</div>}
          </section>

          {!signalLocked ? <section className="signal-detail__section signal-evidence-search" aria-labelledby="add-signal-evidence-heading">
            <div className="signal-detail__section-heading"><div><p className="drawer-section-label" id="add-signal-evidence-heading">Add project evidence</p><span>Search only original records owned by this project.</span></div></div>
            <div className="signal-evidence-search__controls"><label><FileSearch size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search evidence by source, author, or text" /></label><select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}><option value="all">All source types</option><option value="mention">Radar mentions</option><option value="research">Research</option><option value="inspiration">Inspiration</option></select></div>
            {searching ? <div className="signal-evidence-search__state"><LoaderCircle className="spin" size={15} />Searching project evidence…</div> : !visibleCandidates.length ? <div className="signal-evidence-search__state">No unlinked evidence matched this search.</div> : <div className="signal-evidence-search__results">{visibleCandidates.slice(0, 12).map((item) => { const Icon = kindIcon(item.kind); return <button key={sourceKey(item.kind, item.id)} type="button" onClick={() => { setSelected(item); setRelationship("support"); setRationale(""); }} className={selected?.id === item.id && selected.kind === item.kind ? "active" : ""}><span><Icon size={15} /></span><div><strong>{item.title}</strong><small>{item.sourceLabel}{item.author ? ` · ${item.author}` : ""}</small><p>{item.excerpt || item.initialInterpretation || "No excerpt available."}</p></div><Plus size={15} /></button>; })}</div>}
            {selected ? <div className="signal-evidence-composer"><div><Badge>{selected.kind}</Badge><strong>{selected.title}</strong><button onClick={() => setSelected(null)} aria-label="Cancel evidence selection"><X size={14} /></button></div><fieldset><legend>How does this source relate?</legend>{(["support", "contradict", "context"] as const).map((value) => <label key={value} htmlFor={`signal-evidence-${value}`} aria-label={relationshipLabels[value]} className={relationship === value ? "active" : ""}><input id={`signal-evidence-${value}`} type="radio" name="evidence-relationship" checked={relationship === value} onChange={() => setRelationship(value)} /><span><strong>{relationshipLabels[value]}</strong></span></label>)}</fieldset><label><span>Evidence rationale <small>Optional, but useful for future review</small></span><textarea rows={3} maxLength={2000} value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="What exactly does this source support, challenge, or contextualise?" /></label><div><Button onClick={() => setSelected(null)}>Cancel</Button><Button variant="dark" disabled={pending === "attach"} onClick={() => void attach()}>{pending === "attach" ? <LoaderCircle className="spin" size={14} /> : <Link2 size={14} />}Link evidence</Button></div></div> : null}
          </section> : null}

          <SignalAssessmentPanel snapshots={snapshots} evidenceCount={links.length} pending={pending === "assessment"} readOnly={signalLocked} onCreate={() => void assess()} />
        </> : null}
        <footer className="signal-detail__footer"><Button onClick={onClose}>Back to signals</Button></footer>
      </aside>
    </div>
  );
}
