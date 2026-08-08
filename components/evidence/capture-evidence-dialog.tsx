"use client";

import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, ChevronUp, FilePlus2, Link2, LoaderCircle, NotebookPen, Plus, RotateCw, ShieldCheck, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/primitives";
import { prepareQuickCapture, type QuickCaptureField, type QuickCaptureMode } from "@/lib/evidence/capture";
import { findLocalUrlDuplicate, inspectEvidenceUrl, type DuplicateEvidence } from "@/lib/evidence/url-extraction";

interface CaptureSuccess {
  title: string;
  projectName: string;
}

const emptyErrors: Partial<Record<QuickCaptureField, string>> = {};

export function CaptureEvidenceDialog() {
  const {
    captureDialogOpen,
    setCaptureDialogOpen,
    projects,
    researchItems,
    activeProjectId,
    addResearch,
    setProjectDialogOpen,
    workspaceStatus,
  } = useApp();
  const [mode, setMode] = useState<QuickCaptureMode>("url");
  const [projectId, setProjectId] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [whyItMatters, setWhyItMatters] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(emptyErrors);
  const [formError, setFormError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [success, setSuccess] = useState<CaptureSuccess | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateEvidence | null>(null);
  const [inspectionError, setInspectionError] = useState("");
  const [pendingKeepOpen, setPendingKeepOpen] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  const destinationProjectId = projects.some((project) => project.id === projectId)
    ? projectId
    : projects.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : projects[0]?.id ?? "";

  useEffect(() => {
    if (!captureDialogOpen) return;
    const focusTimer = window.setTimeout(() => mode === "url" ? urlInputRef.current?.focus() : noteInputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [captureDialogOpen, mode]);

  if (!captureDialogOpen) return null;

  function clearDraft(nextMode = mode) {
    setMode(nextMode);
    setSource("");
    setNote("");
    setTitle("");
    setWhyItMatters("");
    setDetailsOpen(false);
    setErrors(emptyErrors);
    setFormError("");
    setSuccess(null);
    setDuplicate(null);
    setInspectionError("");
    setPendingKeepOpen(false);
  }

  function close() {
    if (saving) return;
    if (success) clearDraft("url");
    setCaptureDialogOpen(false);
    setSavedMessage("");
    setFormError("");
    setErrors(emptyErrors);
  }

  function resetCapture(nextMode = mode) {
    clearDraft(nextMode);
    window.setTimeout(() => nextMode === "url" ? urlInputRef.current?.focus() : noteInputRef.current?.focus(), 0);
  }

  function chooseMode(nextMode: QuickCaptureMode) {
    if (nextMode === mode) return;
    resetCapture(nextMode);
    setSavedMessage("");
  }

  async function saveCapture(keepOpen: boolean, options: { skipInspection?: boolean; allowDuplicate?: boolean } = {}) {
    const prepared = prepareQuickCapture({ mode, projectId: destinationProjectId, source, note, title, whyItMatters });
    if (!prepared.ok) {
      setErrors(prepared.errors);
      setFormError("");
      return;
    }
    const project = projects.find((candidate) => candidate.id === prepared.value.projectId);
    if (!project) {
      setErrors({ projectId: "Choose a project for this evidence." });
      return;
    }

    setSaving(true);
    setErrors(emptyErrors);
    setFormError("");
    setSavedMessage("");
    setDuplicate(null);
    setInspectionError("");
    try {
      let capture: Parameters<typeof addResearch>[0] = prepared.value;
      if (mode === "url" && !options.allowDuplicate) {
        const localDuplicate = findLocalUrlDuplicate(researchItems, project.id, [prepared.value.source]);
        if (localDuplicate) {
          setDuplicate({
            id: localDuplicate.cloudId ?? localDuplicate.id,
            clientRef: localDuplicate.clientRef ?? null,
            title: localDuplicate.title,
            url: localDuplicate.url ?? null,
            createdAt: localDuplicate.createdAt ?? null,
          });
          setPendingKeepOpen(keepOpen);
          return;
        }
      }

      if (mode === "url" && !options.skipInspection) {
        try {
          const inspection = await inspectEvidenceUrl(project, prepared.value.source);
          if (inspection.duplicate && !options.allowDuplicate) {
            setDuplicate(inspection.duplicate);
            setPendingKeepOpen(keepOpen);
            return;
          }
          capture = {
            ...prepared.value,
            title: title.trim() || inspection.metadata.title || prepared.value.title,
            urlMetadata: inspection.metadata,
          };
        } catch (error) {
          setInspectionError(error instanceof Error ? error.message : "Sift could not inspect this page.");
          setPendingKeepOpen(keepOpen);
          return;
        }
      }

      const item = await addResearch(capture);
      if (keepOpen) {
        resetCapture(mode);
        setSavedMessage(`Saved “${item.title}” to ${project.name}.`);
      } else {
        setSuccess({ title: item.title, projectName: project.name });
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Evidence could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function resetInspectionDecision() {
    setDuplicate(null);
    setInspectionError("");
    setFormError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void saveCapture(false);
  }

  const noProjects = workspaceStatus !== "loading" && !projects.length;

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="capture-dialog-title">
      <button className="radar-overlay__scrim" onClick={close} aria-label="Close capture evidence" />
      <form className="workspace-dialog workspace-dialog--small capture-dialog" onSubmit={submit}>
        <header>
          <div>
            <span className="workspace-dialog__icon"><FilePlus2 size={19} /></span>
            <div>
              <p className="eyebrow">Fast evidence capture</p>
              <h2 id="capture-dialog-title">Save it before the signal disappears.</h2>
              <p>Start with a project and a source. Context is optional and can be added later.</p>
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close"><X size={18} /></button>
        </header>

        {success ? (
          <div className="capture-success" aria-live="polite">
            <span><Check size={22} /></span>
            <p className="eyebrow">Evidence captured</p>
            <h3>{success.title}</h3>
            <p>Saved privately to <strong>{success.projectName}</strong> in Research.</p>
          </div>
        ) : noProjects ? (
          <div className="capture-no-project">
            <span><NotebookPen size={22} /></span>
            <h3>Create a project first.</h3>
            <p>Evidence needs a project so Sift can preserve its context and keep future citations inside the correct workspace.</p>
            <Button type="button" variant="dark" onClick={() => { setCaptureDialogOpen(false); setProjectDialogOpen(true); }}><Plus size={15} />Create project</Button>
          </div>
        ) : workspaceStatus === "loading" ? (
          <div className="capture-no-project" aria-live="polite"><LoaderCircle className="spin" size={24} /><h3>Loading your projects…</h3><p>Sift is checking the private workspace before accepting evidence.</p></div>
        ) : (
          <div className="workspace-dialog__body capture-dialog__body">
            <div className="capture-mode-switch" aria-label="Evidence format">
              <button type="button" className={mode === "url" ? "active" : ""} aria-pressed={mode === "url"} onClick={() => chooseMode("url")}><Link2 size={16} /><span><strong>Web link</strong><small>Article, campaign, post, or page</small></span></button>
              <button type="button" className={mode === "note" ? "active" : ""} aria-pressed={mode === "note"} onClick={() => chooseMode("note")}><NotebookPen size={16} /><span><strong>Note</strong><small>Thought, quote, statistic, or excerpt</small></span></button>
            </div>

            {savedMessage ? <div className="capture-inline-success" role="status"><Check size={15} /><span>{savedMessage}</span></div> : null}

            <label>
              <span>Project *</span>
              <select value={destinationProjectId} onChange={(event) => { setProjectId(event.target.value); setErrors(emptyErrors); resetInspectionDecision(); }} aria-invalid={Boolean(errors.projectId)}>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              {errors.projectId ? <small className="capture-field-error">{errors.projectId}</small> : null}
            </label>

            {mode === "url" ? (
              <label>
                <span>Paste URL *</span>
                <input ref={urlInputRef} inputMode="url" value={source} onChange={(event) => { setSource(event.target.value); setErrors(emptyErrors); resetInspectionDecision(); }} placeholder="https://…" aria-invalid={Boolean(errors.source)} />
                {errors.source ? <small className="capture-field-error">{errors.source}</small> : <small className="capture-field-hint">Sift securely checks the page for a title and source details when you save.</small>}
              </label>
            ) : (
              <label>
                <span>Write or paste evidence *</span>
                <textarea ref={noteInputRef} rows={6} value={note} onChange={(event) => { setNote(event.target.value); setErrors(emptyErrors); }} placeholder="Paste the quote, statistic, observation, or thought you want to keep…" aria-invalid={Boolean(errors.note)} />
                {errors.note ? <small className="capture-field-error">{errors.note}</small> : null}
              </label>
            )}

            <button className="capture-details-toggle" type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((current) => !current)}>
              <span><strong>Add context</strong><small>Optional title and why it matters</small></span>
              {detailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {detailsOpen ? (
              <div className="capture-details-panel">
                <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={mode === "url" ? "Uses the website name if left empty" : "Uses the first line if left empty"} /></label>
                <label><span>Why it matters</span><textarea rows={3} value={whyItMatters} onChange={(event) => setWhyItMatters(event.target.value)} placeholder="The strategic value, tension, or question this raises" /></label>
              </div>
            ) : null}

            <p className="capture-privacy-note">Saved to your private Research library. Screenshots and document uploads are not enabled yet.</p>
            {duplicate ? (
              <div className="capture-decision capture-decision--warning" role="alert">
                <AlertTriangle size={18} />
                <div><strong>This link may already be saved.</strong><p>“{duplicate.title}” is already in this project. Open Research to review it, or save another copy intentionally.</p></div>
              </div>
            ) : null}
            {inspectionError ? (
              <div className="capture-decision" role="alert">
                <ShieldCheck size={18} />
                <div><strong>Sift could not read this page.</strong><p>Your link and notes are still safe to save. Some sites block automated previews or the secure extractor may not be deployed yet.</p><small>{inspectionError}</small></div>
              </div>
            ) : null}
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          </div>
        )}

        <footer className="capture-dialog__footer">
          {success ? (
            <><Link className="ui-button ui-button--secondary ui-button--md" href="/research" onClick={() => { clearDraft("url"); setCaptureDialogOpen(false); }}>View Research</Link><Button type="button" onClick={() => resetCapture(mode)}>Capture another</Button><Button type="button" variant="dark" onClick={close}>Done</Button></>
          ) : noProjects || workspaceStatus === "loading" ? <Button type="button" onClick={close}>Close</Button> : duplicate ? (
            <><Button type="button" onClick={close}>Cancel</Button><Link className="ui-button ui-button--secondary ui-button--md" href="/research" onClick={() => setCaptureDialogOpen(false)}>View Research</Link><Button type="button" variant="dark" disabled={saving} onClick={() => void saveCapture(pendingKeepOpen, { allowDuplicate: true })}>{saving ? <LoaderCircle className="spin" size={14} /> : null}Save another copy</Button></>
          ) : inspectionError ? (
            <><Button type="button" onClick={close}>Cancel</Button><Button type="button" disabled={saving} onClick={() => void saveCapture(pendingKeepOpen)}><RotateCw size={14} />Try again</Button><Button type="button" variant="dark" disabled={saving} onClick={() => void saveCapture(pendingKeepOpen, { skipInspection: true })}>{saving ? <LoaderCircle className="spin" size={14} /> : null}Save link only</Button></>
          ) : (
            <><Button type="button" onClick={close}>Cancel</Button><Button type="button" disabled={saving} onClick={() => void saveCapture(true)}>{saving ? <LoaderCircle className="spin" size={14} /> : null}Save & continue</Button><Button type="submit" variant="dark" disabled={saving}>{saving ? <LoaderCircle className="spin" size={14} /> : null}{saving ? "Saving…" : "Save evidence"}</Button></>
          )}
        </footer>
      </form>
    </div>
  );
}
