"use client";

import Link from "next/link";
import { ArrowRight, LoaderCircle, Plus, Search, ShieldCheck, Sparkles } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
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
import type { StrategyAnalysisResult, StrategyEvidencePreview } from "@/lib/strategy-ai/types";

type HandoffStatus = "idle" | "saving" | "saved" | "error";

export function StrategyPage() {
  const { projects, activeProjectId, setActiveProjectId, setProjectDialogOpen, openCaptureDialog } = useApp();
  const cloudProjects = useMemo(() => projects.filter((project) => project.cloudId), [projects]);
  const initialProjectId = cloudProjects.some((project) => project.id === activeProjectId)
    ? activeProjectId
    : cloudProjects[0]?.id || "";
  const [projectId, setProjectId] = useState(initialProjectId);
  const [question, setQuestion] = useState("");
  const [task, setTask] = useState<StrategyHandoffTask>("analyse");
  const [preview, setPreview] = useState<StrategyEvidencePreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<StrategyAnalysisResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [handoffPrompt, setHandoffPrompt] = useState("");
  const [handoffResponse, setHandoffResponse] = useState("");
  const [handoffRequestId, setHandoffRequestId] = useState("");
  const [handoffStatus, setHandoffStatus] = useState<HandoffStatus>("idle");
  const [handoffError, setHandoffError] = useState("");
  const [copied, setCopied] = useState(false);
  const resolvedProjectId = cloudProjects.some((project) => project.id === projectId) ? projectId : initialProjectId;
  const matchedPreviewCount = preview?.coverage.matchedEvidence
    ?? preview?.evidence.filter((item) => item.retrievalTier !== "project_context").length
    ?? 0;
  const contextualPreviewCount = preview?.coverage.contextualEvidence
    ?? preview?.evidence.filter((item) => item.retrievalTier === "project_context").length
    ?? 0;

  function clearHandoff() {
    setHandoffPrompt("");
    setHandoffResponse("");
    setHandoffRequestId("");
    setHandoffStatus("idle");
    setHandoffError("");
    setCopied(false);
  }

  async function prepareEvidence(event: FormEvent) {
    event.preventDefault();
    const project = cloudProjects.find((item) => item.id === resolvedProjectId);
    if (!project || !question.trim()) return;
    setStatus("loading");
    setError("");
    setAnalysis(null);
    clearHandoff();
    try {
      const result = await previewStrategyEvidence(project, question.trim());
      setPreview(result);
      setSelected(new Set(result.evidence
        .filter((item) => item.retrievalTier !== "project_context")
        .map((item) => item.identity)));
      setActiveProjectId(project.id);
      setStatus("idle");
    } catch (requestError) {
      setPreview(null);
      setSelected(new Set());
      setError(requestError instanceof Error ? requestError.message : "Evidence could not be prepared.");
      setStatus("error");
    }
  }

  function reset() {
    setQuestion("");
    setTask("analyse");
    setPreview(null);
    setSelected(new Set());
    setAnalysis(null);
    setStatus("idle");
    setError("");
    clearHandoff();
  }

  function changeQuestion(value: string) {
    setQuestion(value);
    if (preview) {
      setPreview(null);
      setSelected(new Set());
      setAnalysis(null);
      clearHandoff();
    }
  }

  function changeProject(value: string) {
    setProjectId(value);
    setPreview(null);
    setSelected(new Set());
    setAnalysis(null);
    clearHandoff();
  }

  function applyQuestionTemplate(templateId: string) {
    const template = STRATEGY_QUESTION_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    changeQuestion(template.question);
    setTask(template.task);
    setAnalysis(null);
    clearHandoff();
  }

  function toggleEvidence(identity: string) {
    setAnalysis(null);
    clearHandoff();
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(identity)) next.delete(identity);
      else next.add(identity);
      return next;
    });
  }

  function prepareHandoff() {
    const project = cloudProjects.find((item) => item.id === resolvedProjectId);
    if (!project || !preview || !selected.size) return;
    const selectedEvidence = preview.evidence.filter((item) => selected.has(item.identity));
    setAnalysis(null);
    setHandoffPrompt(buildStrategyChatGptPrompt({
      projectName: project.name,
      question: question.trim(),
      task,
      evidence: selectedEvidence,
    }));
    setHandoffResponse("");
    setHandoffRequestId(crypto.randomUUID());
    setHandoffStatus("idle");
    setHandoffError("");
    setCopied(false);
    requestAnimationFrame(() => document.getElementById("strategy-handoff-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function copyHandoffPrompt() {
    if (!handoffPrompt) return;
    setHandoffError("");
    try {
      await copyText(handoffPrompt);
      setCopied(true);
    } catch {
      setCopied(false);
      setHandoffError("Sift could not access the clipboard. Open the prompt preview and copy the text manually.");
    }
  }

  async function saveImportedAnalysis() {
    const project = cloudProjects.find((item) => item.id === resolvedProjectId);
    if (!project || !preview || !selected.size || !handoffRequestId) return;
    const orderedEvidenceIdentities = preview.evidence
      .filter((item) => selected.has(item.identity))
      .map((item) => item.identity);
    setHandoffStatus("saving");
    setHandoffError("");
    setAnalysis(null);
    try {
      const parsed = parseStrategyChatGptResponse(handoffResponse, orderedEvidenceIdentities);
      const result = await importChatGptStrategyAnalysis(
        project,
        question.trim(),
        orderedEvidenceIdentities,
        handoffRequestId,
        parsed,
      );
      setAnalysis(result);
      setHandoffStatus("saved");
      requestAnimationFrame(() => document.getElementById("strategy-analysis-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (requestError) {
      setHandoffError(requestError instanceof Error ? requestError.message : "The ChatGPT response could not be validated and saved.");
      setHandoffStatus("error");
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
                <label><span>Thinking task</span><select value={task} onChange={(event) => { setTask(event.target.value as StrategyHandoffTask); clearHandoff(); setAnalysis(null); }}>{STRATEGY_HANDOFF_TASKS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>This tells ChatGPT what kind of strategic thinking to prioritize.</small></label>
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
          onResponseChange={(value) => { setHandoffResponse(value); setHandoffStatus("idle"); setHandoffError(""); setAnalysis(null); }}
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
