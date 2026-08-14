"use client";

import { Images, LoaderCircle, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/primitives";

export function InspirationCaptureDialog({
  initialProjectId,
  onClose,
}: {
  initialProjectId?: string;
  onClose: () => void;
}) {
  const { activeProjectId, addInspiration, projects } = useApp();
  const [projectId, setProjectId] = useState(() => (
    projects.some((project) => project.id === initialProjectId)
      ? initialProjectId!
      : projects.some((project) => project.id === activeProjectId)
        ? activeProjectId
        : projects[0]?.id ?? ""
  ));
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !title.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await addInspiration({
        projectId,
        title: title.trim(),
        type: "Creative reference",
        source: source.trim(),
        note: note.trim(),
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Inspiration could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="inspiration-capture-title">
      <button className="radar-overlay__scrim" type="button" onClick={onClose} aria-label="Close save inspiration" />
      <form className="workspace-dialog workspace-dialog--small" onSubmit={submit}>
        <header>
          <div>
            <span className="workspace-dialog__icon"><Images size={19} /></span>
            <div>
              <p className="eyebrow">Save inspiration</p>
              <h2 id="inspiration-capture-title">Keep what sparked something.</h2>
              <p>A title is enough. Add the source or your thought now, or return to it later.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="workspace-dialog__body">
          <label>
            <span>Project *</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label>
            <span>Title *</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What do you want to remember?" />
          </label>
          <label>
            <span>Link or source <small>Optional</small></span>
            <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste a URL, account, campaign, or source" />
          </label>
          <label>
            <span>What caught your attention? <small>Optional</small></span>
            <textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="A technique, feeling, question, or thought you may want later" />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
        <footer>
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="dark" disabled={!projectId || !title.trim() || saving}>
            {saving ? <LoaderCircle className="spin" size={14} /> : null}
            {saving ? "Saving…" : "Save inspiration"}
          </Button>
        </footer>
      </form>
    </div>
  );
}
