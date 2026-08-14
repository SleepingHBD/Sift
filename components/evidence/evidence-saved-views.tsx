"use client";

import { Bookmark, LoaderCircle, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/primitives";
import type { EvidenceSavedView, EvidenceSavedViewDefinition } from "@/lib/evidence/saved-views";
import type { Project } from "@/lib/types";

type SavedViewsStatus = "idle" | "loading" | "ready" | "error";

interface EvidenceSavedViewsProps {
  views: EvidenceSavedView[];
  status: SavedViewsStatus;
  activeId: string;
  dirty: boolean;
  current: EvidenceSavedViewDefinition;
  projects: Project[];
  pending: string;
  notice: { tone: "success" | "error"; message: string } | null;
  onApply: (id: string) => void;
  onSubmit: (name: string, id: string | null) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onRetry: () => void;
}

function filterSummary(definition: EvidenceSavedViewDefinition, projects: Project[]) {
  const project = definition.projectId
    ? projects.find((item) => (item.cloudId ?? item.id) === definition.projectId)?.name ?? "Unavailable project"
    : "All projects";
  const kinds = { all: "All source types", mention: "Radar mentions", research: "Research & captures", inspiration: "Inspiration" };
  const views = { all: "All sources", "needs-review": "Needs review", recent: "Recently added" };
  const sorts = { newest: "Newest first", oldest: "Oldest first", "recently-reviewed": "Recently reviewed", source: "Source A–Z", project: "Source project A–Z" };
  const groups = { none: "No grouping", project: "Grouped by project", kind: "Grouped by type", status: "Grouped by status" };
  return [
    project,
    kinds[definition.kind],
    views[definition.view],
    sorts[definition.sort],
    groups[definition.group],
    definition.query ? `Search: “${definition.query}”` : "No search phrase",
  ];
}

export function EvidenceSavedViews({
  views,
  status,
  activeId,
  dirty,
  current,
  projects,
  pending,
  notice,
  onApply,
  onSubmit,
  onDelete,
  onRetry,
}: EvidenceSavedViewsProps) {
  const [editor, setEditor] = useState<{ id: string | null; name: string } | null>(null);
  const [deleting, setDeleting] = useState<EvidenceSavedView | null>(null);
  const active = views.find((view) => view.id === activeId) ?? null;
  const summary = useMemo(() => filterSummary(current, projects), [current, projects]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!editor || pending) return;
    if (await onSubmit(editor.name, editor.id)) setEditor(null);
  }

  async function confirmDelete() {
    if (!deleting || pending) return;
    if (await onDelete(deleting.id)) setDeleting(null);
  }

  return (
    <>
      <section className="evidence-saved-views" aria-label="Saved evidence views">
        <div className="evidence-saved-views__label"><Bookmark size={16} /><span><strong>Saved views</strong><small>Private shortcuts to your filters</small></span></div>
        <select aria-label="Apply a saved evidence view" value={activeId} disabled={status === "loading" || !views.length} onChange={(event) => onApply(event.target.value)}>
          <option value="">{status === "loading" ? "Loading saved views…" : views.length ? "Choose a saved view" : "No saved views yet"}</option>
          {views.map((view) => <option value={view.id} key={view.id}>{view.name}</option>)}
        </select>
        {active ? <span className={`evidence-saved-views__state${dirty ? " evidence-saved-views__state--dirty" : ""}`}>{dirty ? "Modified" : "Applied"}</span> : null}
        <div className="evidence-saved-views__actions">
          {status === "error" ? <Button size="sm" onClick={onRetry}>Retry</Button> : null}
          {active ? <Button size="sm" disabled={Boolean(pending)} onClick={() => setEditor({ id: active.id, name: active.name })}>{dirty ? "Update view" : "Rename"}</Button> : null}
          {active ? <Button size="icon" aria-label={`Delete saved view ${active.name}`} disabled={Boolean(pending)} onClick={() => setDeleting(active)}><Trash2 size={14} /></Button> : null}
          <Button size="sm" variant="dark" disabled={status === "loading" || Boolean(pending)} onClick={() => setEditor({ id: null, name: "" })}><Save size={14} />Save current view</Button>
        </div>
      </section>
      {notice ? <p className={`evidence-saved-views__notice evidence-saved-views__notice--${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.message}</p> : null}

      {editor ? (
        <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="saved-view-dialog-title">
          <button className="radar-overlay__scrim" type="button" onClick={() => setEditor(null)} aria-label="Close saved view dialog" />
          <form className="workspace-dialog workspace-dialog--small saved-view-dialog" onSubmit={(event) => void submit(event)}>
            <header><div><span className="workspace-dialog__icon"><Bookmark size={19} /></span><div><p className="eyebrow">Library shortcut</p><h2 id="saved-view-dialog-title">{editor.id ? "Update this saved view." : "Save this Library view."}</h2><p>Sift will remember these filters privately for your account. Sources are not copied.</p></div></div><button type="button" onClick={() => setEditor(null)} aria-label="Close"><X size={18} /></button></header>
            <div className="workspace-dialog__body saved-view-dialog__body">
              <label><span>View name</span><input maxLength={80} required value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="e.g. Unreviewed cultural signals" /></label>
              <div className="saved-view-dialog__summary"><strong>Current view includes</strong><ul>{summary.map((item) => <li key={item}>{item}</li>)}</ul></div>
              {notice?.tone === "error" ? <p className="form-error" role="alert">{notice.message}</p> : null}
            </div>
            <footer><Button type="button" onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" variant="dark" disabled={!editor.name.trim() || Boolean(pending)}>{pending ? <LoaderCircle className="spin" size={14} /> : null}{pending || (editor.id ? "Update saved view" : "Save view")}</Button></footer>
          </form>
        </div>
      ) : null}

      {deleting ? (
        <div className="radar-overlay" role="alertdialog" aria-modal="true" aria-labelledby="delete-saved-view-title" aria-describedby="delete-saved-view-description">
          <button className="radar-overlay__scrim" type="button" onClick={() => setDeleting(null)} aria-label="Cancel deleting saved view" />
          <section className="workspace-dialog workspace-dialog--small saved-view-dialog">
            <header><div><span className="workspace-dialog__icon saved-view-dialog__delete-icon"><Trash2 size={19} /></span><div><p className="eyebrow">Delete shortcut</p><h2 id="delete-saved-view-title">Delete “{deleting.name}”?</h2><p id="delete-saved-view-description">Only this saved shortcut will be removed. Your evidence and its organization will remain untouched.</p></div></div><button type="button" onClick={() => setDeleting(null)} aria-label="Close"><X size={18} /></button></header>
            {notice?.tone === "error" ? <div className="workspace-dialog__body"><p className="form-error" role="alert">{notice.message}</p></div> : null}
            <footer><Button type="button" onClick={() => setDeleting(null)}>Keep view</Button><Button type="button" variant="dark" disabled={Boolean(pending)} onClick={() => void confirmDelete()}>{pending ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}{pending || "Delete saved view"}</Button></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
