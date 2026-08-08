"use client";

import { FolderInput, LoaderCircle, Tags, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import type { EvidenceBulkFailure } from "@/lib/evidence/organization";
import type { EvidenceReviewStatus, Project } from "@/lib/types";

export interface EvidenceBulkFeedback {
  tone: "success" | "warning" | "error";
  message: string;
  failures?: EvidenceBulkFailure[];
}

export function EvidenceBulkToolbar({
  selectedCount,
  projects,
  pending,
  feedback,
  onReview,
  onTags,
  onAssignProject,
  onClear,
}: {
  selectedCount: number;
  projects: Project[];
  pending: string;
  feedback: EvidenceBulkFeedback | null;
  onReview: (status: EvidenceReviewStatus) => Promise<void>;
  onTags: (mode: "add" | "remove", tags: string) => Promise<boolean>;
  onAssignProject: (projectId: string) => Promise<boolean>;
  onClear: () => void;
}) {
  const [panel, setPanel] = useState<"tags" | "project" | null>(null);
  const [tagMode, setTagMode] = useState<"add" | "remove">("add");
  const [tagInput, setTagInput] = useState("");
  const [projectId, setProjectId] = useState("");
  const disabled = Boolean(pending);

  async function applyTags() {
    if (!tagInput.trim()) return;
    if (await onTags(tagMode, tagInput)) setTagInput("");
  }

  async function assignProject() {
    if (!projectId) return;
    if (await onAssignProject(projectId)) setProjectId("");
  }

  return (
    <section className="evidence-bulk-toolbar" aria-label="Bulk evidence actions">
      <div className="evidence-bulk-toolbar__main">
        <div className="evidence-bulk-toolbar__count"><strong>{selectedCount}</strong><span>{selectedCount === 1 ? "item selected" : "items selected"}</span></div>
        <div className="evidence-bulk-toolbar__actions">
          <label>
            <span className="sr-only">Set review status</span>
            <select value="" disabled={disabled} onChange={(event) => {
              if (event.target.value) void onReview(event.target.value as EvidenceReviewStatus);
            }}>
              <option value="">Set review status…</option>
              <option value="unreviewed">Needs review</option>
              <option value="relevant">Relevant</option>
              <option value="irrelevant">Not relevant</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <Button size="sm" aria-pressed={panel === "tags"} disabled={disabled} onClick={() => setPanel((current) => current === "tags" ? null : "tags")}><Tags size={14} />Tags</Button>
          <Button size="sm" aria-pressed={panel === "project"} disabled={disabled} onClick={() => setPanel((current) => current === "project" ? null : "project")}><FolderInput size={14} />Add to project</Button>
          <button className="evidence-bulk-toolbar__clear" type="button" disabled={disabled} onClick={onClear}><X size={14} />Clear selection</button>
        </div>
        {pending ? <span className="evidence-bulk-toolbar__pending"><LoaderCircle className="spin" size={15} />{pending}</span> : null}
      </div>

      {panel === "tags" ? (
        <div className="evidence-bulk-toolbar__panel">
          <div><strong>Edit shared tags</strong><span>Shared tags help you organize evidence without rewriting extracted keywords or topics.</span></div>
          <select aria-label="Choose tag operation" value={tagMode} disabled={disabled} onChange={(event) => setTagMode(event.target.value as "add" | "remove")}><option value="add">Add tags</option><option value="remove">Remove shared tags</option></select>
          <input aria-label="Tags separated by commas" value={tagInput} disabled={disabled} onChange={(event) => setTagInput(event.target.value)} placeholder="community, pricing, youth culture" />
          <Button variant="dark" size="sm" disabled={disabled || !tagInput.trim()} onClick={() => void applyTags()}>Apply</Button>
        </div>
      ) : null}

      {panel === "project" ? (
        <div className="evidence-bulk-toolbar__panel">
          <div><strong>Add evidence to a project</strong><span>The original stays in its source project; Sift adds a traceable project link.</span></div>
          <select aria-label="Choose destination project" value={projectId} disabled={disabled} onChange={(event) => setProjectId(event.target.value)}><option value="">Choose project…</option>{projects.flatMap((project) => project.cloudId ? [<option key={project.cloudId} value={project.cloudId}>{project.name}</option>] : [])}</select>
          <Button variant="dark" size="sm" disabled={disabled || !projectId} onClick={() => void assignProject()}>Add evidence</Button>
        </div>
      ) : null}

      {feedback ? (
        <div className={`evidence-bulk-feedback evidence-bulk-feedback--${feedback.tone}`} role="status">
          <strong>{feedback.message}</strong>
          {feedback.failures?.length ? <details><summary>Review {feedback.failures.length} unsuccessful {feedback.failures.length === 1 ? "item" : "items"}</summary><ul>{feedback.failures.slice(0, 8).map((item) => <li key={item.key}><span>{item.title}</span><small>{item.message}</small></li>)}</ul></details> : null}
        </div>
      ) : null}
    </section>
  );
}
