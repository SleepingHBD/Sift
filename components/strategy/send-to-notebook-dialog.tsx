"use client";

import { BookOpenText, Check, FileText, LoaderCircle, Plus, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import {
  addEvidenceToNotebook,
  createStrategySession,
  listNotebookDestinations,
} from "@/lib/strategy-pipeline/repository";
import type { EvidenceReference } from "@/lib/evidence/reference";
import type { NotebookDestination } from "@/lib/strategy-pipeline/types";

function sourceTypeLabel(kind: EvidenceReference["kind"]) {
  if (kind === "mention") return "Radar mention";
  if (kind === "inspiration") return "Inspiration";
  return "Library source";
}

export function SendToNotebookDialog({
  evidence,
  onClose,
  onAdded,
}: {
  evidence: EvidenceReference;
  onClose: () => void;
  onAdded?: (page: NotebookDestination) => void;
}) {
  const [pages, setPages] = useState<NotebookDestination[]>([]);
  const [pageId, setPageId] = useState("");
  const [creating, setCreating] = useState(false);
  const [pageTitle, setPageTitle] = useState("");
  const [thought, setThought] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [error, setError] = useState("");
  const [savedPage, setSavedPage] = useState<NotebookDestination | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setStatus("loading");
      setError("");
      listNotebookDestinations(evidence.projectId, evidence).then((destinations) => {
        if (!active) return;
        setPages(destinations);
        setPageId(destinations.find((page) => !page.existingTurnId)?.id ?? destinations[0]?.id ?? "");
        setCreating(!destinations.length);
        setStatus("ready");
      }).catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Notebook pages could not be loaded.");
        setStatus("error");
      });
    });
    return () => { active = false; };
  }, [evidence]);

  const selectedPage = useMemo(() => pages.find((page) => page.id === pageId) ?? null, [pageId, pages]);
  const alreadyAttached = Boolean(!creating && selectedPage?.existingTurnId);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (status === "saving" || status === "saved" || alreadyAttached) return;
    if (creating && !pageTitle.trim()) return;
    if (!creating && !selectedPage) return;
    setStatus("saving");
    setError("");
    try {
      const destination = creating
        ? { ...(await createStrategySession(evidence.projectId, pageTitle)), existingTurnId: null }
        : selectedPage!;
      if (creating) {
        setPages((current) => [destination, ...current]);
        setPageId(destination.id);
        setCreating(false);
      }
      const result = await addEvidenceToNotebook(destination.id, evidence.projectId, evidence, thought);
      if (result.status === "already_attached") {
        setPages((current) => current.map((page) => page.id === destination.id ? { ...page, existingTurnId: result.turnId } : page));
        setPageId(destination.id);
        setCreating(false);
        setError("This source is already on that notebook page, so Sift did not add a duplicate.");
        setStatus("error");
        return;
      }
      const completed = { ...destination, existingTurnId: result.turn.id, updatedAt: result.turn.createdAt };
      setSavedPage(completed);
      setStatus("saved");
      onAdded?.(completed);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "This source could not be added to the notebook.");
      setStatus("error");
    }
  }

  const busy = status === "loading" || status === "saving";

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="send-to-notebook-title">
      <button className="radar-overlay__scrim" onClick={busy ? undefined : onClose} aria-label="Close Send to Notebook" />
      <form className="workspace-dialog send-to-notebook-dialog" onSubmit={save}>
        <header>
          <div><span className="workspace-dialog__icon"><BookOpenText size={19} /></span><div><p className="eyebrow">Send to Notebook</p><h2 id="send-to-notebook-title">Keep this with your thinking.</h2><p>Choose one page and add a thought only if you have one. The original source stays cited automatically.</p></div></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="workspace-dialog__body send-to-notebook-dialog__body">
          <div className="send-to-notebook-dialog__source">
            <span><FileText size={14} />{sourceTypeLabel(evidence.kind)}</span>
            <strong>{evidence.title}</strong>
            <p>{evidence.excerpt || evidence.originalContent || evidence.notes || "Saved source"}</p>
          </div>

          {status === "loading" ? <div className="send-to-notebook-dialog__state"><LoaderCircle className="spin" size={20} /><span>Opening your notebook pages…</span></div> : null}
          {status === "saved" && savedPage ? <div className="send-to-notebook-dialog__success"><span><Check size={16} /></span><div><strong>Added to {savedPage.title}</strong><p>{thought.trim() ? "Your thought and the original citation were saved together." : "The original citation was saved without forcing you to write anything."}</p></div></div> : null}

          {status !== "loading" && status !== "saved" ? <>
            <div className="send-to-notebook-dialog__heading"><span>Notebook page</span><button type="button" disabled={creating && !pages.length} onClick={() => { setCreating((value) => !value); setError(""); }}>{creating ? "Choose existing" : <><Plus size={12} />New page</>}</button></div>
            {creating ? <label className="send-to-notebook-dialog__new-page"><span>Page name</span><input value={pageTitle} maxLength={200} onChange={(event) => setPageTitle(event.target.value)} placeholder="e.g. Community as social infrastructure" /></label> : (
              <div className="send-to-notebook-dialog__pages" role="radiogroup" aria-label="Choose notebook page">
                {pages.map((page) => <button type="button" role="radio" aria-checked={pageId === page.id} className={pageId === page.id ? "is-selected" : ""} key={page.id} onClick={() => { setPageId(page.id); setError(""); }}><span><strong>{page.title}</strong><small>Updated {new Date(page.updatedAt).toLocaleDateString()}</small></span>{page.existingTurnId ? <Badge>Already added</Badge> : pageId === page.id ? <Check size={15} /> : null}</button>)}
              </div>
            )}
            {alreadyAttached ? <p className="send-to-notebook-dialog__duplicate"><Check size={13} />This source is already on this page. Nothing will be duplicated.</p> : null}
            <label className="send-to-notebook-dialog__thought"><span>Your thought <em>Optional</em></span><textarea rows={4} maxLength={10_000} value={thought} onChange={(event) => setThought(event.target.value)} placeholder="What caught your attention, or what might this connect to? You can leave this empty." /></label>
          </> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>

        <footer>
          <span>The source is referenced, not copied or rewritten.</span>
          <div><Button type="button" onClick={onClose} disabled={status === "saving"}>{status === "saved" ? "Done" : "Cancel"}</Button>{status !== "saved" ? <Button type="submit" variant="dark" disabled={busy || alreadyAttached || (creating ? !pageTitle.trim() : !selectedPage)}>{status === "saving" ? <LoaderCircle className="spin" size={14} /> : <BookOpenText size={14} />}{status === "saving" ? "Adding…" : "Add to page"}</Button> : null}</div>
        </footer>
      </form>
    </div>
  );
}
