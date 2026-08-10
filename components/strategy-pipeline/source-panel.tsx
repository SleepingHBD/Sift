"use client";

import { Bot, ExternalLink, FileSearch, LoaderCircle, Plus, Radio, Search } from "lucide-react";
import { FormEvent, useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import type { EvidenceReference } from "@/lib/evidence/reference";
import { stageDefinition } from "@/lib/strategy-pipeline/model";
import type {
  StrategyAiInputOption,
  StrategySessionDetail,
  StrategySourceRelationship,
  StrategyStageKind,
} from "@/lib/strategy-pipeline/types";
import type { SignalRecord } from "@/lib/signals/types";

type SourceTab = "evidence" | "signals" | "strategy-ai";

export function StrategySourcePanel({
  session,
  activeStage,
  activeStageSaved,
  evidence,
  signals,
  aiInputs,
  loading,
  onSearch,
  onAttachEvidence,
  onAddInput,
}: {
  session: StrategySessionDetail;
  activeStage: StrategyStageKind;
  activeStageSaved: boolean;
  evidence: EvidenceReference[];
  signals: SignalRecord[];
  aiInputs: StrategyAiInputOption[];
  loading: boolean;
  onSearch: (search: string) => Promise<void>;
  onAttachEvidence: (evidence: EvidenceReference, relationship: StrategySourceRelationship) => Promise<void>;
  onAddInput: (type: "signal" | "ai_message", id: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<SourceTab>("evidence");
  const [query, setQuery] = useState("");
  const [relationship, setRelationship] = useState<StrategySourceRelationship>("support");
  const [pendingId, setPendingId] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const definition = stageDefinition(activeStage);
  const usedInputs = new Set(session.inputs.map((input) => `${input.inputType}:${input.inputId}`));

  async function search(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    try { await onSearch(query); }
    catch (error) { setNotice({ tone: "error", message: error instanceof Error ? error.message : "Evidence could not be searched." }); }
  }

  async function attach(item: EvidenceReference) {
    setPendingId(item.id);
    setNotice(null);
    try {
      await onAttachEvidence(item, relationship);
      setNotice({ tone: "success", message: `Linked to ${definition.label}.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Evidence could not be linked." });
    } finally { setPendingId(""); }
  }

  async function addInput(type: "signal" | "ai_message", id: string) {
    setPendingId(id);
    setNotice(null);
    try {
      await onAddInput(type, id);
      setNotice({ tone: "success", message: type === "signal" ? "Signal added as a starting point." : "Strategy AI analysis added as a thinking input." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Starting point could not be added." });
    } finally { setPendingId(""); }
  }

  return (
    <aside className="insight-source-panel">
      <header>
        <p className="eyebrow">Source panel</p>
        <h2>Ground the argument.</h2>
        <p>Evidence can support, challenge, or contextualise the active <strong>{definition.label}</strong> stage.</p>
      </header>
      <div className="insight-source-panel__tabs" role="tablist" aria-label="Available starting material">
        <button className={tab === "evidence" ? "active" : ""} onClick={() => setTab("evidence")}><FileSearch size={14} /> Evidence</button>
        <button className={tab === "signals" ? "active" : ""} onClick={() => setTab("signals")}><Radio size={14} /> Signals</button>
        <button className={tab === "strategy-ai" ? "active" : ""} onClick={() => setTab("strategy-ai")}><Bot size={14} /> Strategy AI</button>
      </div>

      {notice ? <p className={`insight-source-panel__notice insight-source-panel__notice--${notice.tone}`} role="status">{notice.message}</p> : null}

      {tab === "evidence" ? (
        <>
          <form className="insight-source-search" onSubmit={search}>
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this project's evidence" aria-label="Search project evidence" />
            <button type="submit" aria-label="Search"><Search size={14} /></button>
          </form>
          <label className="insight-relationship-select"><span>Link selected evidence as</span><select value={relationship} onChange={(event) => setRelationship(event.target.value as StrategySourceRelationship)}><option value="support">Supporting evidence</option><option value="contradict">Contradicting evidence</option><option value="context">Context</option></select></label>
          {!activeStageSaved ? <p className="insight-source-panel__guardrail">Save the active {definition.label} claim before attaching original evidence.</p> : null}
          <div className="insight-source-options">
            {loading ? <div className="insight-source-options__state"><LoaderCircle className="spin" size={20} /><span>Loading evidence…</span></div> : evidence.length ? evidence.map((item) => (
              <article key={`${item.kind}:${item.id}`}>
                <div><Badge>{item.kind}</Badge>{item.originalUrl ? <a href={item.originalUrl} target="_blank" rel="noreferrer" aria-label="Open original"><ExternalLink size={13} /></a> : null}</div>
                <h3>{item.title}</h3>
                <p>{item.excerpt || item.originalContent || item.initialInterpretation || item.notes || "Saved source without a text excerpt."}</p>
                <small>{item.sourceLabel} · {new Date(item.capturedAt).toLocaleDateString()}</small>
                <Button size="sm" disabled={!activeStageSaved || pendingId === item.id || !item.cloudId} onClick={() => void attach(item)}>{pendingId === item.id ? <LoaderCircle className="spin" size={13} /> : <Plus size={13} />} Link to {definition.label}</Button>
              </article>
            )) : <div className="insight-source-options__state"><FileSearch size={21} /><strong>No evidence found</strong><span>Capture or import evidence, then return here.</span></div>}
          </div>
        </>
      ) : null}

      {tab === "signals" ? (
        <div className="insight-source-options insight-source-options--inputs">
          <p className="insight-source-panel__explanation">Signals are analytical starting points, not original evidence. Add one for context, then link its underlying sources to your claims.</p>
          {signals.length ? signals.map((signal) => {
            const used = usedInputs.has(`signal:${signal.id}`);
            return <article key={signal.id}><div><Badge>{signal.kind}</Badge><Badge>{signal.movement}</Badge></div><h3>{signal.title}</h3><p>{signal.observation}</p><Button size="sm" disabled={used || pendingId === signal.id} onClick={() => void addInput("signal", signal.id)}>{used ? "Already added" : <><Plus size={13} /> Use as starting point</>}</Button></article>;
          }) : <div className="insight-source-options__state"><Radio size={21} /><strong>No Signals in this project</strong><span>Create a candidate in Trends when you spot a repeated change.</span></div>}
        </div>
      ) : null}

      {tab === "strategy-ai" ? (
        <div className="insight-source-options insight-source-options--inputs">
          <p className="insight-source-panel__explanation">Saved AI analysis is a thinking input, never evidence. Its cited original sources still need to be linked to the relevant stage.</p>
          {aiInputs.length ? aiInputs.map((item) => {
            const used = usedInputs.has(`ai_message:${item.id}`);
            return <article key={item.id}><div><Badge>AI provenance</Badge></div><h3>{item.title}</h3><p>{item.excerpt}</p><small>{new Date(item.createdAt).toLocaleDateString()}</small><Button size="sm" disabled={used || pendingId === item.id} onClick={() => void addInput("ai_message", item.id)}>{used ? "Already added" : <><Plus size={13} /> Use as thinking input</>}</Button></article>;
          }) : <div className="insight-source-options__state"><Bot size={21} /><strong>No saved Strategy AI analysis</strong><span>Run a workspace-backed question and save the response first.</span></div>}
        </div>
      ) : null}
    </aside>
  );
}
