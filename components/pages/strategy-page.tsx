"use client";

import Link from "next/link";
import { ArrowRight, LoaderCircle, Plus, Search, ShieldCheck, Sparkles } from "lucide-react";
import { FormEvent, useMemo } from "react";
import { useApp } from "@/components/app-provider";
import { StrategyAnalysisPanel } from "@/components/strategy/strategy-analysis-result";
import { StrategyChatGptHandoff } from "@/components/strategy/strategy-chatgpt-handoff";
import { StrategyEvidenceScope } from "@/components/strategy/strategy-evidence-scope";
import { Badge, Button, Card, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import {
  buildStrategyChatGptPrompt,
  parseStrategyChatGptResponse,
  STRATEGY_HANDOFF_TASKS,
  type StrategyHandoffTask,
} from "@/lib/strategy-ai/handoff";
import { STRATEGY_QUESTION_TEMPLATES } from "@/lib/strategy-ai/question-templates";
import { importChatGptStrategyAnalysis, previewStrategyEvidence } from "@/lib/strategy-ai/repository";
import { createStrategyWorkingSession, type StrategyWorkingSession } from "@/lib/strategy-ai/session";

export function StrategyPage() {
  const {
    projects,
    activeProjectId,
    setActiveProjectId,
    setProjectDialogOpen,
    openCaptureDialog,
    strategySession,
    setStrategySession,
  } = useApp();
  const cloudProjects = useMemo(() => projects.filter((project) => project.cloudId), [projects]);
  const initialProjectId = cloudProjects.some((project) => project.id === activeProjectId)
    ? activeProjectId
    : cloudProjects[0]?.id || "";
  const {
    projectId,
    question,
    task,
    preview,
    selected,
    analysis,
    status,
    error,
    handoffPrompt,
    handoffResponse,
    handoffRequestId,
    handoffStatus,
    handoffError,
    copied,
  } = strategySession;
  const resolvedProjectId = cloudProjects.some((project) => project.id === projectId) ? projectId : initialProjectId;
  const matchedPreviewCount = preview?.coverage.matchedEvidence
    ?? preview?.evidence.filter((item) => item.retrievalTier !== "project_context").length
    ?? 0;
  const contextualPreviewCount = preview?.coverage.contextualEvidence
    ?? preview?.evidence.filter((item) => item.retrievalTier === "project_context").length
    ?? 0;

  function updateSession(update: Partial<StrategyWorkingSession> | ((current: StrategyWorkingSession) => Partial<StrategyWorkingSession>)) {
    const expectedUserId = strategySession.workspaceUserId;
    setStrategySession((current) => {
      if (current.workspaceUserId !== expectedUserId) return current;
      const patch = typeof update === "function" ? update(current) : update;
      return { ...current, ...patch };
    });
  }

  function clearHandoff() {
    updateSession({
      handoffPrompt: "",
      handoffResponse: "",
      handoffRequestId: "",
      handoffStatus: "idle",
      handoffError: "",
      copied: false,
    });
  }

  async function prepareEvidence(event: FormEvent) {
    event.preventDefault();
    const project = cloudProjects.find((item) => item.id === resolvedProjectId);
    if (!project || !question.trim()) return;
    updateSession({
      projectId: project.id,
      status: "loading",
      error: "",
      analysis: null,
      handoffPrompt: "",
      handoffResponse: "",
      handoffRequestId: "",
      handoffStatus: "idle",
      handoffError: "",
      copied: false,
    });
    try {
      const result = await previewStrategyEvidence(project, question.trim());
      updateSession({
        preview: result,
        selected: new Set(result.evidence
          .filter((item) => item.retrievalTier !== "project_context")
          .map((item) => item.identity)),
        status: "idle",
      });
      setActiveProjectId(project.id);
    } catch (requestError) {
      updateSession({
        preview: null,
        selected: new Set(),
        error: requestError instanceof Error ? requestError.message : "Evidence could not be prepared.",
        status: "error",
      });
    }
  }

  function reset() {
    setStrategySession(createStrategyWorkingSession(strategySession.workspaceUserId, resolvedProjectId));
  }

  function changeQuestion(value: string) {
    updateSession((current) => current.preview ? {
      question: value,
      preview: null,
      selected: new Set(),
      analysis: null,
      handoffPrompt: "",
      handoffResponse: "",
      handoffRequestId: "",
      handoffStatus: "idle",
      handoffError: "",
      copied: false,
    } : { question: value });
  }

  function changeProject(value: string) {
    updateSession({
      projectId: value,
      preview: null,
      selected: new Set(),
      analysis: null,
      status: "idle",
      error: "",
      handoffPrompt: "",
      handoffResponse: "",
      handoffRequestId: "",
      handoffStatus: "idle",
      handoffError: "",
      copied: false,
    });
  }

  function applyQuestionTemplate(templateId: string) {
    const template = STRATEGY_QUESTION_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    updateSession({
      question: template.question,
      task: template.task,
      preview: null,
      selected: new Set(),
      analysis: null,
      status: "idle",
      error: "",
      handoffPrompt: "",
      handoffResponse: "",
      handoffRequestId: "",
      handoffStatus: "idle",
      handoffError: "",
      copied: false,
    });
  }

  function toggleEvidence(identity: string) {
    updateSession((current) => {
      const next = new Set(current.selected);
      if (next.has(identity)) next.delete(identity);
      else next.add(identity);
      return {
        selected: next,
        analysis: null,
        handoffPrompt: "",
        handoffResponse: "",
        handoffRequestId: "",
        handoffStatus: "idle",
        handoffError: "",
        copied: false,
      };
    });
  }

  function prepareHandoff() {
    const project = cloudProjects.find((item) => item.id === resolvedProjectId);
    if (!project || !preview || !selected.size) return;
    const selectedEvidence = preview.evidence.filter((item) => selected.has(item.identity));
    updateSession({
      analysis: null,
      handoffPrompt: buildStrategyChatGptPrompt({
        projectName: project.name,
        question: question.trim(),
        task,
        evidence: selectedEvidence,
      }),
      handoffResponse: "",
      handoffRequestId: crypto.randomUUID(),
      handoffStatus: "idle",
      handoffError: "",
      copied: false,
    });
    requestAnimationFrame(() => document.getElementById("strategy-handoff-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function copyHandoffPrompt() {
    if (!handoffPrompt) return;
    updateSession({ handoffError: "" });
    try {
      await copyText(handoffPrompt);
      updateSession({ copied: true });
    } catch {
      updateSession({
        copied: false,
        handoffError: "Sift could not access the clipboard. Open the prompt preview and copy the text manually.",
      });
    }
  }

  async function saveImportedAnalysis() {
    const project = cloudProjects.find((item) => item.id === resolvedProjectId);
    if (!project || !preview || !selected.size || !handoffRequestId) return;
    const orderedEvidenceIdentities = preview.evidence
      .filter((item) => selected.has(item.identity))
      .map((item) => item.identity);
    updateSession({ handoffStatus: "saving", handoffError: "", analysis: null });
    try {
      const parsed = parseStrategyChatGptResponse(handoffResponse, orderedEvidenceIdentities);
      const result = await importChatGptStrategyAnalysis(
        project,
        question.trim(),
        orderedEvidenceIdentities,
        handoffRequestId,
        parsed,
      );
      updateSession({ analysis: result, handoffStatus: "saved" });
      requestAnimationFrame(() => document.getElementById("strategy-analysis-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (requestError) {
      updateSession({
        handoffError: requestError instanceof Error ? requestError.message : "The ChatGPT response could not be validated and saved.",
        handoffStatus: "error",
      });
    }
  }

  return (
    <div className="page strategy-page">
      <PageIntro eyebrow="Strategy AI · ChatGPT handoff" title="Start with the evidence, then think with ChatGPT." description="Select the evidence yourself, use your existing ChatGPT account, and bring the answer back for citation checks and durable storage.">
        <Button variant="dark" onClick={reset}><Plus size={16} />New question</Button>
      </PageIntro>

      {!cloudProjects.length ? (
        <EmptyState icon={Sparkles} title="Strategy needs a project boundary first." description="Create a cloud-backed project, then capture research or collect permitted conversations. Sift will never invent workspace findings for an empty project." actions={<><Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create project</Button><Button onClick={() => openCaptureDialog("url")}>Capture evidence</Button></>} />
      ) : (
        <div className="strategy-foundation">
          <Card className="strategy-question-card">
            <div className="strategy-question-card__head">
              <span className="ai-orb"><ShieldCheck size={18} /></span>
              <div><Badge>Workspace-backed prompt</Badge><h2>Prepare a research-backed question</h2><p>Retrieval stays deterministic. Only the sources you deliberately leave selected will appear in the prompt.</p></div>
            </div>
            <form onSubmit={prepareEvidence}>
              <div className="strategy-question-options">
                <label><span>Project</span><select value={resolvedProjectId} onChange={(event) => changeProject(event.target.value)}>{cloudProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><small>The project is the authorization and evidence boundary.</small></label>
                <label><span>Thinking task</span><select value={task} onChange={(event) => { updateSession({ task: event.target.value as StrategyHandoffTask, analysis: null }); clearHandoff(); }}>{STRATEGY_HANDOFF_TASKS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>This tells ChatGPT what kind of strategic thinking to prioritize.</small></label>
              </div>
              <label><span>Strategic question</span><textarea rows={5} maxLength={1000} value={question} onChange={(event) => changeQuestion(event.target.value)} placeholder="What is changing, why might it matter, and what evidence supports or challenges that interpretation?" /><small>Write naturally. Sift finds partial matches across your evidence and also shows other eligible project sources when the textual match is weak.</small></label>
              <div className="strategy-question-template">
                <div><Sparkles size={16} /><span><strong>Need a starting point?</strong><small>Choose a template, then replace anything inside [brackets]. Choosing one replaces the current draft.</small></span></div>
                <select aria-label="Strategic question template" defaultValue="" onChange={(event) => { applyQuestionTemplate(event.target.value); event.currentTarget.value = ""; }}>
                  <option value="">Choose a question template…</option>
                  {STRATEGY_QUESTION_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
                </select>
              </div>
              {error ? <div className="strategy-question-card__error" role="alert">{error}</div> : null}
              <div className="strategy-question-card__actions"><Button variant="dark" disabled={status === "loading" || question.trim().length < 3}>{status === "loading" ? <><LoaderCircle className="spin" size={16} />Searching evidence…</> : <><Search size={16} />Find relevant evidence</>}</Button><span>This search stays inside your Sift workspace.</span></div>
            </form>
            {preview ? <div className="strategy-preview-result"><strong>{matchedPreviewCount
              ? `${matchedPreviewCount} relevant ${matchedPreviewCount === 1 ? "match" : "matches"} found`
              : contextualPreviewCount
                ? `No direct match · ${contextualPreviewCount} project ${contextualPreviewCount === 1 ? "source" : "sources"} available`
                : "No eligible project evidence available"}</strong><span>{matchedPreviewCount
              ? `${contextualPreviewCount ? `${contextualPreviewCount} additional project ${contextualPreviewCount === 1 ? "source is" : "sources are"} shown for context. ` : ""}Review the evidence scope before preparing the ChatGPT handoff.`
              : contextualPreviewCount
                ? "Sift has not assumed these sources are relevant. Review and select any that genuinely help answer the question."
                : "Add evidence to this project or change an archived or irrelevant source’s review status."}</span></div> : null}
          </Card>
          <StrategyEvidenceScope preview={preview} selected={selected} onToggle={toggleEvidence} onPrepareHandoff={prepareHandoff} />
        </div>
      )}

      {handoffPrompt ? (
        <StrategyChatGptHandoff
          prompt={handoffPrompt}
          sourceCount={selected.size}
          response={handoffResponse}
          copied={copied}
          status={handoffStatus}
          error={handoffError}
          onCopy={copyHandoffPrompt}
          onResponseChange={(value) => updateSession({ handoffResponse: value, handoffStatus: "idle", handoffError: "", analysis: null })}
          onSave={saveImportedAnalysis}
        />
      ) : null}

      {analysis ? <StrategyAnalysisPanel result={analysis} /> : null}

      <div className="strategy-foundation-note"><Sparkles size={17} /><div><strong>Your ChatGPT subscription stays separate</strong><span>Sift does not request an API key or share your ChatGPT login. You control the copy-and-paste boundary, and Sift validates citations again before saving.</span></div><Link href="/evidence">Review all evidence <ArrowRight size={13} /></Link></div>
    </div>
  );
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}
