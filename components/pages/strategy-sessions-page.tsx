"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileSearch,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { InsightBuilderPage } from "@/components/pages/insight-builder-page";
import { Badge, Button, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import {
  addStrategyConversationTurn,
  listStrategySessions,
  loadStrategySession,
  startStrategyConversation,
} from "@/lib/strategy-pipeline/repository";
import { stageDefinition } from "@/lib/strategy-pipeline/model";
import type {
  StrategySessionDetail,
  StrategySessionSummary,
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

export function StrategySessionsPage() {
  const {
    projects,
    activeProjectId,
    setActiveProjectId,
    setProjectDialogOpen,
    openCaptureDialog,
  } = useApp();
  const cloudProjects = useMemo(() => projects.filter((project) => project.cloudId), [projects]);
  const initialProjectId = cloudProjects.some((project) => project.id === activeProjectId)
    ? activeProjectId
    : cloudProjects[0]?.id ?? "";
  const [projectClientId, setProjectClientId] = useState(initialProjectId);
  const [sessions, setSessions] = useState<StrategySessionSummary[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<StrategySessionDetail | null>(null);
  const [openingMessage, setOpeningMessage] = useState("");
  const [draft, setDraft] = useState("");
  const [startingNew, setStartingNew] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const resolvedProjectClientId = cloudProjects.some((project) => project.id === projectClientId)
    ? projectClientId
    : initialProjectId;
  const project = cloudProjects.find((item) => item.id === resolvedProjectClientId);
  const cloudProjectId = project?.cloudId ?? "";

  const loadProjectSessions = useCallback(async (projectId: string) => {
    setLoading(true);
    setError("");
    try {
      const rows = await listStrategySessions(projectId);
      setSessions(rows);
      setSessionId((current) => rows.some((item) => item.id === current) ? current : rows[0]?.id ?? "");
      if (!rows.length) {
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
    queueMicrotask(() => { if (active) void loadProjectSessions(cloudProjectId); });
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

  function changeProject(value: string) {
    setProjectClientId(value);
    setSessionId("");
    setSession(null);
    setStartingNew(false);
    setReviewMode(false);
    setError("");
    setActiveProjectId(value);
  }

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
    if (!session || !draft.trim()) return;
    setSending(true);
    setError("");
    try {
      const turn = await addStrategyConversationTurn(session.id, session.projectId, draft);
      setSession((current) => current ? { ...current, turns: [...current.turns, turn], updatedAt: turn.createdAt } : current);
      setSessions((current) => current
        .map((item) => item.id === session.id ? { ...item, updatedAt: turn.createdAt } : item)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
      setDraft("");
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
    setError("");
    setReviewMode(false);
  }

  if (!cloudProjects.length) {
    return (
      <div className="page strategy-conversation-page">
        <PageIntro eyebrow="Think / Strategy Sessions" title="Think it through, one step at a time." description="Start with an unfinished question. Sift will gradually keep the evidence, conversation, and eventual argument together." />
        <EmptyState icon={MessageCircle} eyebrow="Project required" title="Your first strategy conversation needs a project." description="A project keeps the conversation and every future citation inside the correct private workspace." actions={<Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create project</Button>} />
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

  const sourceCount = new Set(session?.stages.flatMap((stage) => stage.sources.map((source) => `${source.source.kind}:${source.source.id}`)) ?? []).size;

  return (
    <div className="page strategy-conversation-page">
      <PageIntro eyebrow="Think / Strategy Sessions" title="Think it through, one step at a time." description="Talk through what you are noticing without completing the whole strategy at once. Your formal argument remains available when you are ready to shape it.">
        <Button onClick={() => setReviewMode(true)}><BookOpen size={15} />Review argument</Button>
        <Button variant="dark" onClick={beginAnotherConversation}><Plus size={15} />New conversation</Button>
      </PageIntro>

      <section className="strategy-conversation-toolbar" aria-label="Strategy conversation selection">
        <label><span>Project</span><select value={resolvedProjectClientId} onChange={(event) => changeProject(event.target.value)}>{cloudProjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <ArrowRight size={15} />
        <label><span>Conversation</span><select value={startingNew ? "" : sessionId} disabled={!sessions.length || startingNew} onChange={(event) => { setStartingNew(false); setSessionId(event.target.value); }}>{startingNew ? <option value="">Starting a new conversation</option> : sessions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      </section>

      {error ? <div className="strategy-conversation-error" role="alert"><strong>Strategy Sessions needs attention.</strong><span>{error}</span></div> : null}

      {startingNew ? (
        <section className="strategy-conversation-start">
          <span className="strategy-conversation-start__icon"><MessageCircle size={23} /></span>
          <p className="eyebrow">New strategy conversation</p>
          <h2>What are you trying to understand?</h2>
          <p>It can be incomplete. Describe the behaviour, question, tension, or situation currently on your mind.</p>
          <form onSubmit={startConversation}>
            <textarea rows={6} maxLength={10000} value={openingMessage} onChange={(event) => setOpeningMessage(event.target.value)} placeholder="I keep noticing…\nI am trying to understand…\nSomething feels different about…" aria-label="Opening strategy thought" />
            <div><span>Sift will use this as the conversation title. You can keep developing it later.</span><Button variant="dark" disabled={sending || !openingMessage.trim()}>{sending ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}Start conversation</Button></div>
          </form>
          {sessions.length ? <Button size="sm" onClick={() => setStartingNew(false)}>Return to current conversation</Button> : null}
        </section>
      ) : loading && !session ? (
        <div className="strategy-conversation-loading"><LoaderCircle className="spin" size={21} /><span>Loading your conversation…</span></div>
      ) : session ? (
        <div className="strategy-conversation-layout">
          <main className="strategy-conversation-thread">
            <header>
              <div><p className="eyebrow">Current conversation</p><h2>{session.title}</h2></div>
              <Badge>{session.turns.length} {session.turns.length === 1 ? "thought" : "thoughts"}</Badge>
            </header>

            <div className="strategy-conversation-timeline" aria-label="Strategy conversation">
              <article className="strategy-turn strategy-turn--sift">
                <span className="strategy-turn__avatar">S</span>
                <div><strong>Sift</strong><p>We can develop this gradually. You do not need to identify the pattern, tension, or insight yet.</p></div>
              </article>
              {session.turns.map((turn) => (
                <article className={`strategy-turn strategy-turn--${turn.role}`} key={turn.id}>
                  <span className="strategy-turn__avatar">{turn.role === "user" ? "You" : "S"}</span>
                  <div><strong>{turn.role === "user" ? "You" : turn.origin === "chatgpt_manual" ? "ChatGPT handoff" : "Sift"}</strong><p>{turn.content}</p><time>{formatTurnTime(turn.createdAt)}</time></div>
                </article>
              ))}
              <article className="strategy-turn strategy-turn--sift strategy-turn--next">
                <span className="strategy-turn__avatar">S</span>
                <div><strong>One useful next step</strong><p>{nextPrompt(session)}</p><div className="strategy-turn__actions"><Button size="sm" onClick={() => openCaptureDialog("url")}><FileSearch size={14} />Add evidence</Button><Link className="ui-button ui-button--secondary ui-button--sm" href="/strategy-ai">Use current ChatGPT handoff <ArrowRight size={13} /></Link></div></div>
              </article>
            </div>

            <form className="strategy-conversation-composer" onSubmit={sendTurn}>
              <textarea rows={4} maxLength={10000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write what you noticed, wondered, disagreed with, or are not sure about…" aria-label="Continue strategy conversation" />
              <div><span>This saves your thinking. It does not turn it into a formal insight automatically.</span><Button variant="dark" disabled={sending || !draft.trim()}>{sending ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}Save thought</Button></div>
            </form>
          </main>

          <aside className="strategy-conversation-memory">
            <header><p className="eyebrow">Strategy so far</p><h2>Nothing is due.</h2><p>Keep collecting pieces. Structure appears only when it becomes useful.</p></header>
            <dl>
              <div><dt>Conversation</dt><dd>{session.turns.length} saved</dd></div>
              <div><dt>Original evidence</dt><dd>{sourceCount} linked</dd></div>
              <div><dt>Formal claims</dt><dd>{session.stages.length} of 6</dd></div>
            </dl>
            {session.stages.length ? <div className="strategy-conversation-memory__argument"><p className="drawer-section-label">Current argument</p>{session.stages.map((stage) => <button key={stage.id} type="button" onClick={() => setReviewMode(true)}><CheckCircle2 size={13} /><span><strong>{stageDefinition(stage.kind).label}</strong><small>{stage.content}</small></span></button>)}</div> : <div className="strategy-conversation-memory__empty"><Sparkles size={19} /><strong>Your argument can emerge later.</strong><span>For now, continue the conversation or add evidence whenever you find it.</span></div>}
            <Button onClick={() => setReviewMode(true)}><BookOpen size={14} />Open Review argument</Button>
            <p className="strategy-conversation-memory__boundary">ChatGPT handoff integration will move into this conversation in the next transition increment. The current verified handoff remains available in the meantime.</p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
