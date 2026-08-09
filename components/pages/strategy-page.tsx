"use client";

import Link from "next/link";
import { ArrowRight, LoaderCircle, Plus, Search, ShieldCheck, Sparkles } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { StrategyEvidenceScope } from "@/components/strategy/strategy-evidence-scope";
import { Badge, Button, Card, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import { previewStrategyEvidence } from "@/lib/strategy-ai/repository";
import type { StrategyEvidencePreview } from "@/lib/strategy-ai/types";

export function StrategyPage() {
  const { projects, activeProjectId, setActiveProjectId, setProjectDialogOpen, openCaptureDialog } = useApp();
  const cloudProjects = useMemo(() => projects.filter((project) => project.cloudId), [projects]);
  const initialProjectId = cloudProjects.some((project) => project.id === activeProjectId)
    ? activeProjectId
    : cloudProjects[0]?.id || "";
  const [projectId, setProjectId] = useState(initialProjectId);
  const [question, setQuestion] = useState("");
  const [preview, setPreview] = useState<StrategyEvidencePreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const resolvedProjectId = cloudProjects.some((project) => project.id === projectId) ? projectId : initialProjectId;

  async function prepareEvidence(event: FormEvent) {
    event.preventDefault();
    const project = cloudProjects.find((item) => item.id === resolvedProjectId);
    if (!project || !question.trim()) return;
    setStatus("loading");
    setError("");
    try {
      const result = await previewStrategyEvidence(project, question.trim());
      setPreview(result);
      setSelected(new Set(result.evidence.map((item) => item.identity)));
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
    setPreview(null);
    setSelected(new Set());
    setStatus("idle");
    setError("");
  }

  function toggleEvidence(identity: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(identity)) next.delete(identity);
      else next.add(identity);
      return next;
    });
  }

  return (
    <div className="page strategy-page">
      <PageIntro eyebrow="Strategy AI · Phase 6" title="Start with the evidence, then ask for direction." description="Prepare an inspectable project scope before any model is allowed to form a workspace-backed answer.">
        <Button variant="dark" onClick={reset}><Plus size={16} />New question</Button>
      </PageIntro>

      {!cloudProjects.length ? (
        <EmptyState icon={Sparkles} title="Strategy needs a project boundary first." description="Create a cloud-backed project, then capture research or collect permitted conversations. Sift will never invent workspace findings for an empty project." actions={<><Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create project</Button><Button onClick={() => openCaptureDialog("url")}>Capture evidence</Button></>} />
      ) : (
        <div className="strategy-foundation">
          <Card className="strategy-question-card">
            <div className="strategy-question-card__head">
              <span className="ai-orb"><ShieldCheck size={18} /></span>
              <div><Badge>Workspace-backed analysis</Badge><h2>Prepare a research-backed question</h2><p>This step retrieves evidence only. It does not generate an interpretation, hypothesis, or recommendation.</p></div>
            </div>
            <form onSubmit={prepareEvidence}>
              <label><span>Project</span><select value={resolvedProjectId} onChange={(event) => { setProjectId(event.target.value); setPreview(null); setSelected(new Set()); }}>{cloudProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><small>The project is the authorization and evidence boundary.</small></label>
              <label><span>Strategic question</span><textarea rows={5} maxLength={1000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What is changing, why might it matter, and what evidence supports or challenges that interpretation?" /><small>Write the real question you want to investigate. Sift derives a transparent full-text evidence search from it.</small></label>
              {error ? <div className="strategy-question-card__error" role="alert">{error}</div> : null}
              <div className="strategy-question-card__actions"><Button variant="dark" disabled={status === "loading" || question.trim().length < 3}>{status === "loading" ? <><LoaderCircle className="spin" size={16} />Searching evidence…</> : <><Search size={16} />Find relevant evidence</>}</Button><span>No OpenAI request is made yet.</span></div>
            </form>
            {preview ? <div className="strategy-preview-result"><strong>{preview.evidence.length} candidate source{preview.evidence.length === 1 ? "" : "s"} found</strong><span>Review the right-hand evidence scope and remove anything that should not influence the future answer.</span></div> : null}
          </Card>
          <StrategyEvidenceScope preview={preview} selected={selected} onToggle={toggleEvidence} />
        </div>
      )}

      <div className="strategy-foundation-note"><Sparkles size={17} /><div><strong>Why analysis is not generated yet</strong><span>The secure retrieval and citation boundary must be proven before a live model key is connected. The next increment will add structured, cited responses without changing this source-selection step.</span></div><Link href="/evidence">Review all evidence <ArrowRight size={13} /></Link></div>
    </div>
  );
}
