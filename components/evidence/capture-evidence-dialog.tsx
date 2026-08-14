"use client";

import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, ChevronUp, FileImage, FilePlus2, Link2, LoaderCircle, MessageSquareText, NotebookPen, Plus, RotateCw, ShieldCheck, Upload, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/primitives";
import { prepareQuickCapture, type EvidenceCaptureDialogMode, type QuickCaptureField } from "@/lib/evidence/capture";
import { formatEvidenceFileSize, validateEvidenceFile } from "@/lib/evidence/file-capture";
import {
  inferSocialPlatform,
  prepareSocialCapture,
  socialPlatforms,
  validateSocialScreenshot,
  type SocialCaptureField,
  type SocialPlatform,
} from "@/lib/evidence/social-capture";
import { findLocalUrlDuplicate, inspectEvidenceUrl, type DuplicateEvidence } from "@/lib/evidence/url-extraction";

interface CaptureSuccess {
  title: string;
  projectName: string;
}

type CaptureField = QuickCaptureField | SocialCaptureField | "file";

const emptyErrors: Partial<Record<CaptureField, string>> = {};

export function CaptureEvidenceDialog() {
  const {
    captureDialogOpen,
    captureDialogMode,
    captureDialogOptions,
    setCaptureDialogOpen,
    projects,
    researchItems,
    activeProjectId,
    addResearch,
    addResearchFile,
    addSocialResearch,
    setProjectDialogOpen,
    workspaceStatus,
  } = useApp();
  const [mode, setMode] = useState<EvidenceCaptureDialogMode>("url");
  const [projectId, setProjectId] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [whyItMatters, setWhyItMatters] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState<SocialPlatform>("Other");
  const [platformEdited, setPlatformEdited] = useState(false);
  const [author, setAuthor] = useState("");
  const [caption, setCaption] = useState("");
  const [selectedComments, setSelectedComments] = useState("");
  const [observedAt, setObservedAt] = useState("");
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const destinationProjectId = projects.some((project) => project.id === projectId)
    ? projectId
    : projects.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : projects[0]?.id ?? "";

  useEffect(() => {
    if (!captureDialogOpen) return;
    const resetTimer = window.setTimeout(() => {
      setMode(captureDialogMode);
      setProjectId(captureDialogOptions.projectId ?? "");
      setSource(captureDialogOptions.initialSource ?? "");
      setNote("");
      setTitle("");
      setWhyItMatters("");
      setFile(null);
      setPlatform("Other");
      setPlatformEdited(false);
      setAuthor("");
      setCaption("");
      setSelectedComments("");
      setObservedAt("");
      setDetailsOpen(false);
      setErrors(emptyErrors);
      setFormError("");
      setSavedMessage("");
      setSuccess(null);
      setDuplicate(null);
      setInspectionError("");
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [captureDialogMode, captureDialogOpen, captureDialogOptions]);

  useEffect(() => {
    if (!captureDialogOpen) return;
    const focusTimer = window.setTimeout(() => {
      if (mode === "url") urlInputRef.current?.focus();
      if (mode === "note") noteInputRef.current?.focus();
      if (mode === "social") urlInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [captureDialogOpen, mode]);

  if (!captureDialogOpen) return null;

  function clearDraft(nextMode = mode) {
    setMode(nextMode);
    setSource("");
    setNote("");
    setTitle("");
    setWhyItMatters("");
    setFile(null);
    setPlatform("Other");
    setPlatformEdited(false);
    setAuthor("");
    setCaption("");
    setSelectedComments("");
    setObservedAt("");
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
    window.setTimeout(() => {
      if (nextMode === "url") urlInputRef.current?.focus();
      if (nextMode === "note") noteInputRef.current?.focus();
      if (nextMode === "social") urlInputRef.current?.focus();
    }, 0);
  }

  function chooseMode(nextMode: EvidenceCaptureDialogMode) {
    if (nextMode === mode) return;
    resetCapture(nextMode);
    setSavedMessage("");
  }

  async function saveCapture(keepOpen: boolean, options: { skipInspection?: boolean; allowDuplicate?: boolean } = {}) {
    if (mode === "file") {
      const validation = file ? validateEvidenceFile(file) : { ok: false as const, error: "Choose a screenshot or document." };
      const project = projects.find((candidate) => candidate.id === destinationProjectId);
      if (!project || !validation.ok || !file) {
        setErrors({
          ...(!project ? { projectId: "Choose a project for this evidence." } : {}),
          ...(!validation.ok ? { file: validation.error } : {}),
        });
        setFormError("");
        return;
      }
      setSaving(true);
      setErrors(emptyErrors);
      setFormError("");
      setSavedMessage("");
      try {
        const item = await addResearchFile({
          projectId: project.id,
          title,
          summary: whyItMatters,
          file,
          captureOrigin: "global_capture",
        });
        captureDialogOptions.onSaved?.(item);
        if (keepOpen) {
          resetCapture("file");
          setSavedMessage(`Saved “${item.title}” to ${project.name}.`);
        } else {
          setSuccess({ title: item.title, projectName: project.name });
        }
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "File evidence could not be saved.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (mode === "social") {
      const prepared = prepareSocialCapture({
        projectId: destinationProjectId,
        source,
        platform,
        author,
        caption,
        selectedComments,
        observedAt,
        title,
        whyItMatters,
      });
      const screenshotValidation = file ? validateSocialScreenshot(file) : null;
      if (!prepared.ok || (screenshotValidation && !screenshotValidation.ok)) {
        setErrors({
          ...(!prepared.ok ? prepared.errors : {}),
          ...(screenshotValidation && !screenshotValidation.ok ? { screenshot: screenshotValidation.error } : {}),
        });
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
        if (!options.allowDuplicate) {
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

        let urlMetadata;
        let capturedTitle = prepared.value.title;
        if (!options.skipInspection) {
          try {
            const inspection = await inspectEvidenceUrl(project, prepared.value.source);
            if (inspection.duplicate && !options.allowDuplicate) {
              setDuplicate(inspection.duplicate);
              setPendingKeepOpen(keepOpen);
              return;
            }
            urlMetadata = inspection.metadata;
            capturedTitle = title.trim() || inspection.metadata.title || prepared.value.title;
          } catch (error) {
            setInspectionError(error instanceof Error ? error.message : "Sift could not inspect this social post.");
            setPendingKeepOpen(keepOpen);
            return;
          }
        }

        const item = await addSocialResearch({
          projectId: project.id,
          title: capturedTitle,
          url: prepared.value.source,
          platform: prepared.value.platform,
          author: prepared.value.author,
          caption: prepared.value.caption,
          selectedComments: prepared.value.selectedComments,
          observedAt: prepared.value.observedAt,
          summary: prepared.value.summary,
          screenshot: file ?? undefined,
          urlMetadata,
        });
        captureDialogOptions.onSaved?.(item);
        if (keepOpen) {
          resetCapture("social");
          setSavedMessage(`Saved “${item.title}” to ${project.name}.`);
        } else {
          setSuccess({ title: item.title, projectName: project.name });
        }
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Social evidence could not be saved.");
      } finally {
        setSaving(false);
      }
      return;
    }

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
      captureDialogOptions.onSaved?.(item);
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

  function selectFile(nextFile: File | null) {
    setFile(nextFile);
    const validation = nextFile ? (mode === "social" ? validateSocialScreenshot(nextFile) : validateEvidenceFile(nextFile)) : null;
    setErrors(validation && !validation.ok ? { [mode === "social" ? "screenshot" : "file"]: validation.error } : emptyErrors);
    setFormError("");
    if (mode === "file" && nextFile && !title.trim()) setTitle(nextFile.name.replace(/\.[^.]+$/, ""));
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
            <p>Saved privately to <strong>{success.projectName}</strong> in the Library.</p>
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
              <button type="button" className={mode === "social" ? "active" : ""} aria-pressed={mode === "social"} onClick={() => chooseMode("social")}><MessageSquareText size={16} /><span><strong>Social post</strong><small>Capture a post with manual context</small></span></button>
              <button type="button" className={mode === "note" ? "active" : ""} aria-pressed={mode === "note"} onClick={() => chooseMode("note")}><NotebookPen size={16} /><span><strong>Note</strong><small>Thought, quote, statistic, or excerpt</small></span></button>
              <button type="button" className={mode === "file" ? "active" : ""} aria-pressed={mode === "file"} onClick={() => chooseMode("file")}><FileImage size={16} /><span><strong>File</strong><small>Screenshot, image, or PDF</small></span></button>
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
            ) : mode === "social" ? (
              <div className="capture-social-basics">
                <label>
                  <span>Social post URL *</span>
                  <input
                    ref={urlInputRef}
                    inputMode="url"
                    value={source}
                    onChange={(event) => {
                      const nextSource = event.target.value;
                      setSource(nextSource);
                      if (!platformEdited) setPlatform(inferSocialPlatform(nextSource));
                      setErrors(emptyErrors);
                      resetInspectionDecision();
                    }}
                    placeholder="https://…"
                    aria-invalid={Boolean(errors.source)}
                  />
                  {errors.source ? <small className="capture-field-error">{errors.source}</small> : <small className="capture-field-hint">Sift checks for duplicates, but this remains strategist-captured evidence.</small>}
                </label>
                <label>
                  <span>Platform *</span>
                  <select
                    value={platform}
                    onChange={(event) => {
                      setPlatform(event.target.value as SocialPlatform);
                      setPlatformEdited(true);
                      setErrors(emptyErrors);
                    }}
                    aria-invalid={Boolean(errors.platform)}
                  >
                    {socialPlatforms.map((option) => <option key={option}>{option}</option>)}
                  </select>
                  {errors.platform ? <small className="capture-field-error">{errors.platform}</small> : null}
                </label>
              </div>
            ) : mode === "note" ? (
              <label>
                <span>Write or paste evidence *</span>
                <textarea ref={noteInputRef} rows={6} value={note} onChange={(event) => { setNote(event.target.value); setErrors(emptyErrors); }} placeholder="Paste the quote, statistic, observation, or thought you want to keep…" aria-invalid={Boolean(errors.note)} />
                {errors.note ? <small className="capture-field-error">{errors.note}</small> : null}
              </label>
            ) : (
              <div className="capture-file-field">
                <span>Screenshot or document *</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <div
                  className={`capture-file-drop${errors.file ? " capture-file-drop--error" : ""}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    selectFile(event.dataTransfer.files?.[0] ?? null);
                  }}
                >
                  {file ? <FileImage size={25} /> : <Upload size={25} />}
                  <div>
                    <strong>{file?.name ?? "Drop a file here"}</strong>
                    <small>{file ? `${formatEvidenceFileSize(file.size)} · ${file.type || "Unknown type"}` : "JPG, PNG, WebP, or PDF · up to 20 MB"}</small>
                  </div>
                  <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()}>{file ? "Replace" : "Choose file"}</Button>
                </div>
                {errors.file ? <small className="capture-field-error">{errors.file}</small> : null}
              </div>
            )}

            <button className="capture-details-toggle" type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((current) => !current)}>
              <span><strong>{mode === "social" ? "Add post details & context" : "Add context"}</strong><small>{mode === "social" ? "Optional source details and an initial interpretation" : "Optional title and initial interpretation"}</small></span>
              {detailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {detailsOpen ? (
              <div className="capture-details-panel">
                {mode === "social" ? (
                  <>
                    <div className="capture-section-guide">
                      <strong>Source evidence</strong>
                      <span>Record what the post and its audience actually said. Keep your own reading in “Initial interpretation.”</span>
                    </div>
                    <div className="capture-social-meta">
                      <label><span>Account / author</span><input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="@account or author name" /><small className="capture-field-hint">The public username or creator responsible for the post.</small></label>
                      <label><span>Date observed</span><input type="date" value={observedAt} onChange={(event) => { setObservedAt(event.target.value); setErrors(emptyErrors); }} aria-invalid={Boolean(errors.observedAt)} />{errors.observedAt ? <small className="capture-field-error">{errors.observedAt}</small> : <small className="capture-field-hint">When you found or captured it—not necessarily its publication date.</small>}</label>
                    </div>
                    <label><span>Caption / selected post text</span><textarea rows={4} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Paste the exact caption or relevant passage" /><small className="capture-field-hint">Copy the source’s own words. Do not add your analysis here.</small></label>
                    <label><span>Relevant comments</span><textarea rows={4} value={selectedComments} onChange={(event) => setSelectedComments(event.target.value)} placeholder="@viewer: I joined mainly to meet people." /><small className="capture-field-hint">Keep only comments that reveal a useful reaction; include public speaker labels when helpful.</small></label>
                    <div className="capture-file-field">
                      <span>Screenshot</span>
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} tabIndex={-1} aria-hidden="true" />
                      <div className={`capture-file-drop capture-file-drop--compact${errors.screenshot ? " capture-file-drop--error" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0] ?? null); }}>
                        {file ? <FileImage size={22} /> : <Upload size={22} />}
                        <div><strong>{file?.name ?? "Optional private screenshot"}</strong><small>{file ? `${formatEvidenceFileSize(file.size)} · ${file.type || "Unknown type"}` : "JPG, PNG, or WebP · up to 20 MB"}</small></div>
                        <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()}>{file ? "Replace" : "Choose"}</Button>
                      </div>
                      {errors.screenshot ? <small className="capture-field-error">{errors.screenshot}</small> : null}
                      {!errors.screenshot ? <small className="capture-field-hint">Optional visual record in case the original post changes or disappears. Stored privately.</small> : null}
                    </div>
                    <div className="capture-section-guide capture-section-guide--interpretation">
                      <strong>Your context</strong>
                      <span>Describe how you will find this later and why it deserves strategic attention.</span>
                    </div>
                  </>
                ) : null}
                <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={mode === "url" ? "Uses the website name if left empty" : mode === "social" ? "e.g. TikTok post about running clubs as social spaces" : mode === "note" ? "Uses the first line if left empty" : "Uses the filename if left empty"} />{mode === "social" ? <small className="capture-field-hint">A short, searchable description. Leave blank to use the platform and account.</small> : null}</label>
                <label><span>Initial interpretation</span><textarea rows={3} value={whyItMatters} onChange={(event) => setWhyItMatters(event.target.value)} placeholder="Why might this matter? Note a behaviour, tension, shift, or question to investigate." /><small className="capture-field-hint">Your capture-time reading. Sift preserves it separately from both source evidence and later working notes.</small></label>
              </div>
            ) : null}

            <p className="capture-privacy-note">{mode === "social" ? "Saved as strategist-captured evidence, never as connector-collected conversation. Optional screenshots use private Storage." : "Saved to your private Library. Files use private Storage and short-lived links when opened."}</p>
            {duplicate ? (
              <div className="capture-decision capture-decision--warning" role="alert">
                <AlertTriangle size={18} />
                <div><strong>This link may already be saved.</strong><p>“{duplicate.title}” is already in this project. Open Evidence to review it, or save another copy intentionally.</p></div>
              </div>
            ) : null}
            {inspectionError ? (
              <div className="capture-decision" role="alert">
                <ShieldCheck size={18} />
                <div><strong>Sift could not read this page.</strong><p>{mode === "social" ? "Social platforms often block automated previews. You can still preserve the link and the source details you entered as a manual capture." : "Your link and notes are still safe to save. Some sites block automated previews or the secure extractor may not be deployed yet."}</p><small>{inspectionError}</small></div>
              </div>
            ) : null}
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          </div>
        )}

        <footer className="capture-dialog__footer">
          {success ? (
            <><Link className="ui-button ui-button--secondary ui-button--md" href="/evidence?kind=research" onClick={() => { clearDraft("url"); setCaptureDialogOpen(false); }}>View Library</Link><Button type="button" onClick={() => resetCapture(mode)}>Capture another</Button><Button type="button" variant="dark" onClick={close}>Done</Button></>
          ) : noProjects || workspaceStatus === "loading" ? <Button type="button" onClick={close}>Close</Button> : duplicate ? (
            <><Button type="button" onClick={close}>Cancel</Button><Link className="ui-button ui-button--secondary ui-button--md" href="/evidence?kind=research" onClick={() => setCaptureDialogOpen(false)}>View Library</Link><Button type="button" variant="dark" disabled={saving} onClick={() => void saveCapture(pendingKeepOpen, { allowDuplicate: true })}>{saving ? <LoaderCircle className="spin" size={14} /> : null}Save another copy</Button></>
          ) : inspectionError ? (
            <><Button type="button" onClick={close}>Cancel</Button><Button type="button" disabled={saving} onClick={() => void saveCapture(pendingKeepOpen)}><RotateCw size={14} />Try again</Button><Button type="button" variant="dark" disabled={saving} onClick={() => void saveCapture(pendingKeepOpen, { skipInspection: true })}>{saving ? <LoaderCircle className="spin" size={14} /> : null}{mode === "social" ? "Save manual capture" : "Save link only"}</Button></>
          ) : (
            <><Button type="button" onClick={close}>Cancel</Button><Button type="button" disabled={saving} onClick={() => void saveCapture(true)}>{saving ? <LoaderCircle className="spin" size={14} /> : null}Save & continue</Button><Button type="submit" variant="dark" disabled={saving}>{saving ? <LoaderCircle className="spin" size={14} /> : null}{saving ? mode === "file" ? "Uploading…" : "Saving…" : "Save evidence"}</Button></>
          )}
        </footer>
      </form>
    </div>
  );
}
