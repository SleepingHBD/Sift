"use client";

import { FormEvent, useMemo, useState } from "react";
import { Radar, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import type { Project } from "@/lib/types";
import type { CreateSignalInput } from "@/lib/signals/types";

const DEFAULT_SCOPE = "Observed within this project's collected evidence; not a population-level claim.";

interface SignalDialogProps {
  open: boolean;
  projects: Project[];
  initialProjectId?: string;
  onClose: () => void;
  onCreate: (input: CreateSignalInput) => Promise<void>;
}

export function SignalDialog({ open, projects, initialProjectId, onClose, onCreate }: SignalDialogProps) {
  const cloudProjects = useMemo(() => projects.filter((project) => project.cloudId), [projects]);
  const preferredProjectId = cloudProjects.find((project) => project.cloudId === initialProjectId)?.cloudId
    ?? cloudProjects[0]?.cloudId
    ?? "";
  const [projectId, setProjectId] = useState(preferredProjectId);
  const [kind, setKind] = useState<CreateSignalInput["kind"]>("signal");
  const [title, setTitle] = useState("");
  const [observation, setObservation] = useState("");
  const [scopeNote, setScopeNote] = useState(DEFAULT_SCOPE);
  const [strategistNotes, setStrategistNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!projectId) { setError("Choose a project for this signal."); return; }
    if (!title.trim()) { setError("Give the signal a short, recognisable title."); return; }
    if (!observation.trim()) { setError("Record the observation or proposition you want to investigate."); return; }
    if (!scopeNote.trim()) { setError("Keep a scope note so the claim cannot be mistaken for a population-level fact."); return; }
    setPending(true);
    setError("");
    try {
      await onCreate({ projectId, title, observation, kind, scopeNote, strategistNotes });
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "The signal could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="signal-dialog-title">
      <button className="radar-overlay__scrim" disabled={pending} onClick={onClose} aria-label="Close signal form" />
      <form className="workspace-dialog workspace-dialog--small" onSubmit={submit}>
        <header>
          <div><span className="workspace-dialog__icon"><Radar size={19} /></span><div><p className="eyebrow">New candidate</p><h2 id="signal-dialog-title">Record what may be changing.</h2><p>This is a working observation, not a declared trend. Evidence and contradiction will determine what it becomes.</p></div></div>
          <button type="button" disabled={pending} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="workspace-dialog__body signal-dialog__body">
          <label><span>Project *</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}>{cloudProjects.map((project) => <option key={project.cloudId} value={project.cloudId}>{project.name}</option>)}</select></label>
          <fieldset className="signal-kind-picker"><legend>What are you recording?</legend><label aria-label="Working signal" htmlFor="signal-kind-observation" className={kind === "signal" ? "active" : ""}><input id="signal-kind-observation" type="radio" name="signal-kind" checked={kind === "signal"} onChange={() => setKind("signal")} /><span><strong>Working signal</strong><small>A concrete observation that deserves attention and more evidence.</small></span></label><label aria-label="Hypothesis to test" htmlFor="signal-kind-hypothesis" className={kind === "hypothesis" ? "active" : ""}><input id="signal-kind-hypothesis" type="radio" name="signal-kind" checked={kind === "hypothesis"} onChange={() => setKind("hypothesis")} /><span><strong>Hypothesis to test</strong><small>A possible explanation that must not be presented as fact.</small></span></label></fieldset>
          <label><span>Short title *</span><input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Community language is becoming more prominent" /></label>
          <label><span>{kind === "hypothesis" ? "Hypothesis" : "Observation"} *</span><textarea rows={5} maxLength={5000} value={observation} onChange={(event) => setObservation(event.target.value)} placeholder={kind === "hypothesis" ? "What might explain the evidence, and what would need to be true?" : "What did you notice in the collected evidence? Keep interpretation separate."} /></label>
          <label><span>Evidence scope *</span><textarea rows={3} maxLength={1000} value={scopeNote} onChange={(event) => setScopeNote(event.target.value)} /><small className="field-help">This qualifier stays visible beside the signal so a limited dataset is never mistaken for the wider population.</small></label>
          <label><span>Strategist notes</span><textarea rows={3} maxLength={10000} value={strategistNotes} onChange={(event) => setStrategistNotes(event.target.value)} placeholder="Optional: why you are watching this, or what you need to investigate next" /></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
        <footer><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="dark" disabled={pending || !cloudProjects.length}>{pending ? "Saving…" : "Create candidate"}</Button></footer>
      </form>
    </div>
  );
}
