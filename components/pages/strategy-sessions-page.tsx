"use client";

import {
  ArrowLeft,
  BookOpen,
  BookOpenText,
  CheckCircle2,
  FileSearch,
  Link2,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { InsightBuilderPage } from "@/components/pages/insight-builder-page";
import { StrategySourceDrawer } from "@/components/strategy-pipeline/source-drawer";
import { NotebookSourcePicker } from "@/components/strategy/notebook-source-picker";
import { StrategySessionHandoff } from "@/components/strategy/strategy-session-handoff";
import { Badge, Button, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import {
  addStrategyConversationTurn,
  listStrategySessions,
  loadStrategySession,
  startStrategyConversation,
  updateStrategyPieceStatus,
} from "@/lib/strategy-pipeline/repository";
import { strategyPieceLabels } from "@/lib/strategy-pipeline/conversation";
import { findNotebookUrl } from "@/lib/strategy-pipeline/notebook-capture";
import { stageDefinition } from "@/lib/strategy-pipeline/model";
import { researchItemToEvidenceReference, type EvidenceReference } from "@/lib/evidence/reference";
import type { ResearchItem } from "@/lib/types";
import type {
  StrategySessionDetail,
  StrategyPieceSourceRecord,
  StrategySessionPieceRecord,
  StrategySessionSummary,
  StrategyTurnSourceRecord,
} from "@/lib/strategy-pipeline/types";

function formatTurnTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function nextPrompt(session: StrategySessionDetail) {
  if (!session.turns.length) {
    return "Start wherever your thinking currently is. What are you trying to understand, and what first made you notice it?";
  }
  if (session.turns.length === 1) {
    return "What made this feel worth investigating? Add a source if you have one, or keep explaining it in your own words.";
  }
  if (!session.stages.length) {
    return "Keep going. What feels repeated, contradictory, surprising, or still unresolved? Nothing needs to become an insight yet.";
  }
  return "Your formal argument is still available in Review argument. Continue thinking here whenever something changes, conflicts, or needs more evidence.";
}

function evidenceKey(source: EvidenceReference) {
  return `${source.kind}:${source.cloudId ?? source.id}`;
}

export function StrategySessionsPage() {
  const {
    projects,
    activeProjectId,
    setProjectDialogOpen,
    openCaptureDialog,
  } = useApp();
  const cloudProjects = useMemo(() => projects.filter((project) => project.cloudId), [projects]);
  const resolvedProjectClientId = cloudProjects.some((project) => project.id === activeProjectId)
    ? activeProjectId
    : cloudProjects[0]?.id ?? "";
  const [sessions, setSessions] = useState<StrategySessionSummary[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<StrategySessionDetail | null>(null);
  const [openingMessage, setOpeningMessage] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingSources, setPendingSources] = useState<EvidenceReference[]>([]);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [startingNew, setStartingNew] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<StrategyPieceSourceRecord | StrategyTurnSourceRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const project = cloudProjects.find((item) => item.id === resolvedProjectClientId);
  const cloudProjectId = project?.cloudId ?? "";

  const loadProjectSessions = useCallback(async (projectId: string) => {
    setLoading(true);
    setError("");
    try {
      const rows = await listStrategySessions(projectId);
      setSessions(rows);
      setSessionId((current) => rows.some((item) => item.id === current) ? current : rows[0]?.id ?? "");
      if (rows.length) {
        setStartingNew(false);
      } else {
        setSession(null);
        setStartingNew(true);
      }
    } catch (loadError) {
      setSessions([]);
      setSession(null);
      setError(loadError instanceof Error ? loadError.message : "Strategy sessions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cloudProjectId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSessionId("");
      setSession(null);
      setStartingNew(false);
      setReviewMode(false);
      setMemoryOpen(false);
      setHandoffOpen(false);
      setPendingSources([]);
      setSourcePickerOpen(false);
      setError("");
      void loadProjectSessions(cloudProjectId);
    });
    return () => { active = false; };
  }, [cloudProjectId, loadProjectSessions]);

  useEffect(() => {
    if (!sessionId || !cloudProjectId || startingNew) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError("");
      loadStrategySession(sessionId, cloudProjectId)
        .then((detail) => { if (active) setSession(detail); })
        .catch((loadError) => {
          if (!active) return;
          setSession(null);
          setError(loadError instanceof Error ? loadError.message : "This conversation could not be loaded.");
        })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [cloudProjectId, sessionId, startingNew]);

  async function startConversation(event: FormEvent) {
    event.preventDefault();
    if (!cloudProjectId || !openingMessage.trim()) return;
    setSending(true);
    setError("");
    try {
      const created = await startStrategyConversation(cloudProjectId, openingMessage);
      setSessions((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSessionId(created.id);
      setStartingNew(false);
      setOpeningMessage("");
      setSession(await loadStrategySession(created.id, cloudProjectId));
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "The conversation could not be started.");
    } finally {
      setSending(false);
    }
  }

  async function sendTurn(event: FormEvent) {
    event.preventDefault();
    if (!session || (!draft.trim() && !pendingSources.length)) return;
    setSending(true);
    setError("");
    try {
      const turn = await addStrategyConversationTurn(session.id, session.projectId, draft, pendingSources);
      setSession((current) => current ? { ...current, turns: [...current.turns, turn], updatedAt: turn.createdAt } : current);
      setSessions((current) => current
        .map((item) => item.id === session.id ? { ...item, updatedAt: turn.createdAt } : item)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
      setDraft("");
      setPendingSources([]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "This thought could not be saved.");
    } finally {
      setSending(false);
    }
  }

  function beginAnotherConversation() {
    setStartingNew(true);
    setOpeningMessage("");
    setDraft("");
    setPendingSources([]);
    setSourcePickerOpen(false);
    setError("");
    setReviewMode(false);
    setMemoryOpen(false);
    setHandoffOpen(false);
  }

  async function reloadCurrentSession() {
    if (!session || !cloudProjectId) return;
    const detail = await loadStrategySession(session.id, cloudProjectId);
    setSession(detail);
    setSessions((current) => current
      .map((item) => item.id === detail.id ? { ...item, updatedAt: detail.updatedAt } : item)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    setHandoffOpen(false);
  }

  function togglePendingSource(source: EvidenceReference) {
    const key = evidenceKey(source);
    setPendingSources((current) => current.some((item) => evidenceKey(item) === key)
      ? current.filter((item) => evidenceKey(item) !== key)
      : [...current, source]);
  }

  function attachCapturedSource(item: ResearchItem) {
    if (!cloudProjectId) return;
    const source = researchItemToEvidenceReference(item, { cloudProjectId });
    setPendingSources((current) => current.some((candidate) => evidenceKey(candidate) === evidenceKey(source))
      ? current
      : [...current, source]);
  }

  function captureSource(mode: "url" | "file", initialSource = "") {
    openCaptureDialog(mode, {
      projectId: resolvedProjectClientId,
      initialSource,
      onSaved: attachCapturedSource,
    });
  }

  async function changePieceStatus(piece: StrategySessionPieceRecord, status: "active" | "dismissed") {
    setError("");
    try {
      await updateStrategyPieceStatus(piece.id, piece.projectId, status);
      setSession((current) => current ? {
        ...current,
        pieces: current.pieces.map((item) => item.id === piece.id ? { ...item, status } : item),
      } : current);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "This working piece could not be updated.");
    }
  }

  if (!cloudProjects.length) {
    return (
      <div className="page strategy-conversation-page">
        <PageIntro eyebrow="Notebook" title="Write it down. Connect it later." description="Begin with an unfinished thought. Sources, questions, and eventual strategy can gather around it gradually." />
        <EmptyState icon={MessageCircle} eyebrow="Start a notebook" title="Give this work a name first." description="A name creates its private home. Brand, market, objectives, and other context can wait until they become useful." actions={<Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create notebook</Button>} />
      </div>
    );
  }

  if (reviewMode) {
    return (
      <div className="strategy-review-mode">
        <div className="strategy-review-mode__return">
          <Button onClick={() => setReviewMode(false)}><ArrowLeft size={15} />Back to conversation</Button>
          <span>The detailed argument, evidence links, uncertainty, and revision history remain available here.</span>
        </div>
        <InsightBuilderPage />
      </div>
    );
  }

  const sourceCount = new Set([
    ...(session?.turns.flatMap((turn) => turn.sources.map((source) => `${source.source.kind}:${source.source.id}`)) ?? []),
    ...(session?.stages.flatMap((stage) => stage.sources.map((source) => `${source.source.kind}:${source.source.id}`)) ?? []),
    ...(session?.pieces.flatMap((piece) => piece.sources.map((source) => `${source.source.kind}:${source.source.id}`)) ?? []),
  ]).size;
  const detectedUrl = findNotebookUrl(draft);
  const detectedUrlAttached = Boolean(detectedUrl && pendingSources.some((source) => source.originalUrl === detectedUrl || source.canonicalUrl === detectedUrl));

  return (
    <div className="page strategy-conversation-page">
      <header className="notebook-workspace-header">
        <div>
          <p className="eyebrow">Notebook</p>
          <h1>{project?.name}</h1>
          <p>{project?.description || "A quiet place for unfinished thoughts, useful sources, and the connections that emerge between them."}</p>
        </div>
        <div className="notebook-workspace-header__actions">
          <Button aria-expanded={memoryOpen} onClick={() => setMemoryOpen((current) => !current)}><BookOpen size={15} />{memoryOpen ? "Hide memory" : "Notebook memory"}</Button>
          <Button variant="dark" onClick={beginAnotherConversation}><Plus size={15} />New page</Button>
        </div>
      </header>

      <section className="notebook-page-switcher" aria-label="Notebook page selection">
        <label>
          <span>Page</span>
          <select value={startingNew ? "" : sessionId} disabled={!sessions.length || startingNew} onChange={(event) => { setStartingNew(false); setSessionId(event.target.value); setPendingSources([]); setSourcePickerOpen(false); }}>
            {startingNew ? <option value="">Starting a new page</option> : sessions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <span>{sessions.length ? `${sessions.length} saved ${sessions.length === 1 ? "page" : "pages"}` : "Your first page"}</span>
      </section>

      {error ? <div className="strategy-conversation-error" role="alert"><strong>This notebook needs attention.</strong><span>{error}</span></div> : null}

      {startingNew ? (
        <section className="strategy-conversation-start">
          <span className="strategy-conversation-start__icon"><MessageCircle size={23} /></span>
          <p className="eyebrow">New notebook page</p>
          <h2>What are you trying to understand?</h2>
          <p>It can be incomplete. Describe the behaviour, question, tension, or situation currently on your mind.</p>
          <form onSubmit={startConversation}>
            <textarea rows={6} maxLength={10000} value={openingMessage} onChange={(event) => setOpeningMessage(event.target.value)} placeholder="I keep noticing…\nI am trying to understand…\nSomething feels different about…" aria-label="Opening strategy thought" />
            <div><span>Sift will use this as the page title. You can keep developing it later.</span><Button variant="dark" disabled={sending || !openingMessage.trim()}>{sending ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}Start page</Button></div>
          </form>
          {sessions.length ? <Button size="sm" onClick={() => setStartingNew(false)}>Return to current page</Button> : null}
        </section>
      ) : loading && !session ? (
        <div className="strategy-conversation-loading"><LoaderCircle className="spin" size={21} /><span>Loading your conversation…</span></div>
      ) : session ? (
        <div className={`strategy-conversation-layout${memoryOpen ? " strategy-conversation-layout--memory-open" : ""}`}>
          <main className="strategy-conversation-thread">
            <header>
              <div><p className="eyebrow">Current page</p><h2>{session.title}</h2></div>
              <Badge>{session.turns.length} {session.turns.length === 1 ? "thought" : "thoughts"}</Badge>
            </header>

            <div className="strategy-conversation-timeline" aria-label="Strategy conversation">
              {session.turns.map((turn) => (
                <article className={`strategy-turn strategy-turn--${turn.role}`} key={turn.id}>
                  <span className="strategy-turn__avatar">{turn.role === "user" ? "You" : "S"}</span>
                  <div><strong>{turn.role === "user" ? "You" : turn.origin === "chatgpt_manual" ? "ChatGPT handoff" : "Sift"}</strong>{turn.metadata.capture_only !== true ? <p>{turn.content}</p> : <p className="strategy-turn__capture-label">Added to this page</p>}{turn.sources.length ? <div className="strategy-turn__sources">{turn.sources.map((source) => <button type="button" key={source.id} onClick={() => setSelectedSource(source)}><FileSearch size={14} /><span><strong>{source.source.title}</strong><small>{source.source.sourceLabel}</small></span></button>)}</div> : null}<time>{formatTurnTime(turn.createdAt)}</time></div>
                </article>
              ))}
              <article className="strategy-turn strategy-turn--sift strategy-turn--next">
                <span className="strategy-turn__avatar">S</span>
                <div><strong>One useful next step</strong><p>{nextPrompt(session)}</p></div>
              </article>
            </div>

            <form className="strategy-conversation-composer" onSubmit={sendTurn}>
              <textarea rows={4} maxLength={10000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write what you noticed, wondered, disagreed with, or are not sure about…" aria-label="Continue strategy conversation" />
              {detectedUrl && !detectedUrlAttached ? <div className="strategy-conversation-composer__link"><Link2 size={14} /><span><strong>Link noticed</strong><small>Save it as a source so this entry keeps the original evidence.</small></span><Button type="button" size="sm" onClick={() => captureSource("url", detectedUrl)}>Save &amp; attach</Button></div> : null}
              {pendingSources.length ? <div className="strategy-conversation-composer__sources" aria-label="Sources attached to this entry">{pendingSources.map((source) => <span key={evidenceKey(source)}><FileSearch size={13} /><span>{source.title}</span><button type="button" onClick={() => togglePendingSource(source)} aria-label={`Remove ${source.title}`}><X size={13} /></button></span>)}</div> : null}
              <div className="strategy-conversation-composer__footer">
                <div className="strategy-conversation-composer__tools">
                  <Button type="button" size="sm" onClick={() => captureSource("url")}><Link2 size={14} />Link</Button>
                  <Button type="button" size="sm" onClick={() => captureSource("file")}><Upload size={14} />File</Button>
                  <Button type="button" size="sm" onClick={() => setSourcePickerOpen(true)}><BookOpenText size={14} />Library</Button>
                  <Button type="button" size="sm" onClick={() => setHandoffOpen(true)}><Sparkles size={14} />Think with ChatGPT</Button>
                </div>
                <Button variant="dark" disabled={sending || (!draft.trim() && !pendingSources.length)}>{sending ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}Save</Button>
              </div>
              <span className="strategy-conversation-composer__note">Write naturally. Sources stay attached to this exact entry; formal strategy can wait.</span>
            </form>
          </main>

          {memoryOpen ? <aside className="strategy-conversation-memory">
            <header><p className="eyebrow">Strategy so far</p><h2>Nothing is due.</h2><p>Keep collecting pieces. Structure appears only when it becomes useful.</p></header>
            <p className="strategy-conversation-memory__summary">{session.turns.length} {session.turns.length === 1 ? "entry" : "entries"} · {sourceCount} {sourceCount === 1 ? "source" : "sources"} · {session.pieces.filter((piece) => piece.status === "active").length} working {session.pieces.filter((piece) => piece.status === "active").length === 1 ? "piece" : "pieces"}</p>
            {session.pieces.length ? <div className="strategy-conversation-memory__pieces"><div className="strategy-conversation-memory__pieces-head"><p className="drawer-section-label">Working pieces</p><span>Suggestions, not conclusions</span></div>{session.pieces.map((piece) => <article className={piece.status === "dismissed" ? "is-dismissed" : ""} key={piece.id}><div><Badge>{strategyPieceLabels[piece.kind]}</Badge>{piece.confidence ? <small>{piece.confidence} confidence</small> : null}</div><p>{piece.content}</p>{piece.whyItMatters ? <span>{piece.whyItMatters}</span> : null}<footer>{piece.sources.map((source, index) => <button key={source.id} type="button" onClick={() => setSelectedSource(source)}>Source {index + 1}</button>)}<button type="button" onClick={() => void changePieceStatus(piece, piece.status === "dismissed" ? "active" : "dismissed")}>{piece.status === "dismissed" ? "Restore" : <><X size={11} />Dismiss</>}</button></footer></article>)}</div> : null}
            {session.stages.length ? <div className="strategy-conversation-memory__argument"><p className="drawer-section-label">Current argument</p>{session.stages.map((stage) => <button key={stage.id} type="button" onClick={() => setReviewMode(true)}><CheckCircle2 size={13} /><span><strong>{stageDefinition(stage.kind).label}</strong><small>{stage.content}</small></span></button>)}</div> : <div className="strategy-conversation-memory__empty"><Sparkles size={19} /><strong>Your argument can emerge later.</strong><span>For now, continue the conversation or add evidence whenever you find it.</span></div>}
            <Button onClick={() => setReviewMode(true)}><BookOpen size={14} />Open Review argument</Button>
            <p className="strategy-conversation-memory__boundary">Working pieces stay separate from your formal argument until you deliberately shape them later.</p>
          </aside> : null}
        </div>
      ) : null}
      {handoffOpen && session && project ? <StrategySessionHandoff project={project} session={session} onClose={() => setHandoffOpen(false)} onSaved={reloadCurrentSession} /> : null}
      {sourcePickerOpen && session ? <NotebookSourcePicker projectId={session.projectId} selected={pendingSources} onToggle={togglePendingSource} onClose={() => setSourcePickerOpen(false)} /> : null}
      <StrategySourceDrawer source={selectedSource} onClose={() => setSelectedSource(null)} />
    </div>
  );
}
