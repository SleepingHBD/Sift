"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  FileJson,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StrategyEvidenceScope } from "@/components/strategy/strategy-evidence-scope";
import { Badge, Button } from "@/components/ui/primitives";
import { buildStrategyChatGptPrompt, parseStrategyChatGptResponse } from "@/lib/strategy-ai/handoff";
import { importChatGptStrategyAnalysis, previewStrategyEvidence } from "@/lib/strategy-ai/repository";
import type { StrategyEvidencePreview } from "@/lib/strategy-ai/types";
import { strategySessionHandoffQuestion } from "@/lib/strategy-pipeline/conversation";
import type { StrategySessionDetail } from "@/lib/strategy-pipeline/types";
import type { Project } from "@/lib/types";

export function StrategySessionHandoff({
  project,
  session,
  onClose,
  onSaved,
}: {
  project: Project;
  session: StrategySessionDetail;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const initialFocus = useMemo(() => strategySessionHandoffQuestion(session), [session]);
  const [focus, setFocus] = useState(initialFocus);
  const [preview, setPreview] = useState<StrategyEvidencePreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"evidence" | "handoff">("evidence");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [requestId, setRequestId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const findEvidence = useCallback(async (question: string) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    setPreview(null);
    setSelected(new Set());
    try {
      const result = await previewStrategyEvidence(project, question.trim());
      if (sequence !== requestSequence.current) return;
      setPreview(result);
      setSelected(new Set(result.evidence
        .filter((item) => item.retrievalTier !== "project_context")
        .map((item) => item.identity)));
    } catch (requestError) {
      if (sequence !== requestSequence.current) return;
      setError(requestError instanceof Error ? requestError.message : "Sift could not prepare evidence for this conversation.");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [project]);

  useEffect(() => {
    queueMicrotask(() => void findEvidence(initialFocus));
    return () => { requestSequence.current += 1; };
  }, [findEvidence, initialFocus]);

  function toggleEvidence(identity: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(identity)) next.delete(identity);
      else next.add(identity);
      return next;
    });
  }

  function prepareHandoff() {
    if (!preview || !selected.size) return;
    const evidence = preview.evidence.filter((item) => selected.has(item.identity));
    setPrompt(buildStrategyChatGptPrompt({
      projectName: project.name,
      question: focus.trim(),
      task: "analyse",
      evidence,
    }));
    setResponse("");
    setRequestId(crypto.randomUUID());
    setCopied(false);
    setError("");
    setStep("handoff");
  }

  async function copyPrompt() {
    setError("");
    try {
      await copyText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Sift could not access the clipboard. Open the prompt preview and copy it manually.");
    }
  }

  async function saveResponse() {
    if (!preview || !selected.size || !requestId || !response.trim()) return;
    const evidenceIdentities = preview.evidence
      .filter((item) => selected.has(item.identity))
      .map((item) => item.identity);
    setSaving(true);
    setError("");
    try {
      const structuredResponse = parseStrategyChatGptResponse(response, evidenceIdentities);
      await importChatGptStrategyAnalysis(
        project,
        focus.trim(),
        evidenceIdentities,
        requestId,
        structuredResponse,
        session.id,
      );
      await onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The ChatGPT response could not be validated and added.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="strategy-session-handoff" role="dialog" aria-modal="true" aria-labelledby="strategy-session-handoff-title">
      <button className="strategy-session-handoff__scrim" aria-label="Close ChatGPT handoff" onClick={onClose} />
      <aside>
        <header>
          <div>
            <Badge>No API billing</Badge>
            <h2 id="strategy-session-handoff-title">Think with ChatGPT</h2>
            <p>{step === "evidence" ? "First, decide what evidence belongs in this part of the conversation." : "Copy the prepared prompt, think in ChatGPT, then bring its response back."}</p>
          </div>
          <button type="button" aria-label="Close ChatGPT handoff" onClick={onClose}><X size={19} /></button>
        </header>

        <nav aria-label="ChatGPT handoff progress">
          <span className={step === "evidence" ? "is-active" : "is-complete"}>{step === "handoff" ? <Check size={13} /> : "1"} Evidence</span>
          <span className={step === "handoff" ? "is-active" : ""}>2 ChatGPT</span>
        </nav>

        <div className="strategy-session-handoff__body">
          {step === "evidence" ? (
            <>
              <section className="strategy-session-handoff__focus">
                <div><p className="eyebrow">Current focus</p><h3>Sift prepared this from your conversation.</h3><p>You can change it, but you do not need to fill in another form.</p></div>
                <textarea rows={6} maxLength={1000} value={focus} onChange={(event) => setFocus(event.target.value)} aria-label="ChatGPT handoff focus" />
                <Button size="sm" disabled={loading || focus.trim().length < 3} onClick={() => void findEvidence(focus)}><RefreshCw size={14} />Refresh evidence</Button>
              </section>
              {loading ? <div className="strategy-session-handoff__loading"><LoaderCircle className="spin" size={20} /><span>Finding evidence from this project…</span></div> : null}
              {error ? <p className="strategy-session-handoff__error" role="alert">{error}</p> : null}
              {!loading && preview ? <StrategyEvidenceScope preview={preview} selected={selected} onToggle={toggleEvidence} onPrepareHandoff={prepareHandoff} /> : null}
            </>
          ) : (
            <section className="strategy-session-handoff__exchange">
              <Button size="sm" onClick={() => { setStep("evidence"); setError(""); }}><ArrowLeft size={14} />Review evidence</Button>
              <div className="strategy-session-handoff__copy">
                <span><ShieldCheck size={18} /></span>
                <div><p className="eyebrow">Take the prompt to ChatGPT</p><h3>Nothing is sent automatically.</h3><p>The prompt contains only the evidence you selected and tells ChatGPT to cite Sift’s exact source IDs.</p></div>
                <div><Button variant="dark" onClick={() => void copyPrompt()}>{copied ? <><Check size={15} />Copied</> : <><Copy size={15} />Copy prompt</>}</Button><a className="ui-button ui-button--secondary ui-button--md" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Open ChatGPT <ExternalLink size={14} /></a></div>
              </div>
              <details className="strategy-session-handoff__prompt"><summary>Review the exact prompt</summary><pre>{prompt}</pre></details>
              <label className="strategy-session-handoff__response"><span>Paste ChatGPT’s JSON response</span><small>Sift validates every citation before anything enters this conversation.</small><textarea rows={13} value={response} onChange={(event) => { setResponse(event.target.value); setError(""); }} placeholder={'Paste the response beginning with { "summary": ... }'} spellCheck={false} /></label>
              {error ? <p className="strategy-session-handoff__error" role="alert">{error}</p> : null}
              <div className="strategy-session-handoff__save"><span>The result will appear as one ChatGPT handoff turn. Its claims become optional working pieces—not approved strategy.</span><Button variant="dark" disabled={saving || !response.trim()} onClick={() => void saveResponse()}>{saving ? <><LoaderCircle className="spin" size={15} />Validating…</> : <><FileJson size={15} />Add to conversation</>}</Button></div>
            </section>
          )}
        </div>
      </aside>
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
