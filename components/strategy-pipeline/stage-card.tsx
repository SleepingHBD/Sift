"use client";

import { AlertCircle, Check, ExternalLink, Link2, LoaderCircle, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { stageDefinition, relationshipLabel } from "@/lib/strategy-pipeline/model";
import type { StrategyStageKind, StrategyStageRecord, StrategyStageSourceRecord } from "@/lib/strategy-pipeline/types";

export function StrategyStageCard({
  kind,
  record,
  active,
  onActivate,
  onSave,
  onOpenSource,
  onRemoveSource,
  renderTraceability,
}: {
  kind: StrategyStageKind;
  record?: StrategyStageRecord;
  active: boolean;
  onActivate: () => void;
  onSave: (kind: StrategyStageKind, content: string) => Promise<void>;
  onOpenSource: (source: StrategyStageSourceRecord) => void;
  onRemoveSource: (source: StrategyStageSourceRecord) => Promise<void>;
  renderTraceability?: (hasUnsavedClaimChanges: boolean) => ReactNode;
}) {
  const definition = stageDefinition(kind);
  const [content, setContent] = useState(record?.content ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const dirty = content.trim() !== (record?.content ?? "").trim();

  async function save() {
    setStatus("saving");
    setError("");
    try {
      await onSave(kind, content);
      setStatus("saved");
    } catch (saveError) {
      setStatus("error");
      setError(saveError instanceof Error ? saveError.message : "This stage could not be saved.");
    }
  }

  return (
    <article className={`insight-stage ${active ? "insight-stage--active" : ""}`}>
      <div className="insight-stage__rail"><span>{definition.position}</span></div>
      <div className="insight-stage__body">
        <header>
          <div>
            <div className="insight-stage__meta">
              <p className="eyebrow">{definition.label}</p>
              {record ? <Badge>{record.status}</Badge> : <Badge>Not saved</Badge>}
            </div>
            <h2>{definition.prompt}</h2>
            <p>{definition.guidance}</p>
          </div>
          <Badge className="insight-stage__claim">{definition.claimType}</Badge>
        </header>

        <textarea
          value={content}
          rows={5}
          maxLength={5_000}
          placeholder={`Write the ${definition.label.toLowerCase()} in your own words…`}
          aria-label={`${definition.label} claim`}
          onFocus={onActivate}
          onChange={(event) => { setContent(event.target.value); setStatus("idle"); setError(""); }}
        />

        <div className="insight-stage__save-row">
          <span>
            {status === "saved" ? <><Check size={14} /> Saved to your workspace</> : null}
            {record && !dirty && status !== "saved" ? `Last saved ${new Date(record.updatedAt).toLocaleString()}` : null}
            {!record ? "Save the claim before linking evidence." : null}
          </span>
          <Button variant="dark" disabled={!content.trim() || status === "saving" || (!dirty && Boolean(record))} onClick={(event) => { event.stopPropagation(); void save(); }}>
            {status === "saving" ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
            {record ? "Save changes" : "Save stage"}
          </Button>
        </div>
        {error ? <p className="insight-stage__error" role="alert"><AlertCircle size={15} /> {error}</p> : null}

        <section className="insight-stage__sources" aria-label={`${definition.label} evidence`}>
          <div className="insight-stage__sources-head">
            <div><Link2 size={15} /><strong>Linked evidence</strong><span>{record?.sources.length ?? 0}</span></div>
            <button type="button" onClick={(event) => { event.stopPropagation(); onActivate(); }}>
              {record ? "Choose from source panel" : "Save this stage first"}
            </button>
          </div>
          {record?.sources.length ? (
            <div className="insight-stage__source-list">
              {record.sources.map((link) => (
                <div key={link.id} className={`insight-source-row insight-source-row--${link.relationship}`}>
                  <button type="button" className="insight-source-row__main" onClick={(event) => { event.stopPropagation(); onOpenSource(link); }}>
                    <span>{relationshipLabel(link.relationship)}</span>
                    <strong>{link.source.title}</strong>
                    <small>{link.source.sourceLabel}{link.source.excerpt ? ` · ${link.source.excerpt}` : ""}</small>
                  </button>
                  {link.source.originalUrl ? <a href={link.source.originalUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} aria-label="Open original source"><ExternalLink size={14} /></a> : null}
                  <button type="button" onClick={(event) => { event.stopPropagation(); void onRemoveSource(link); }} aria-label="Remove evidence link"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          ) : <p className="insight-stage__source-empty">No original evidence is linked to this claim yet.</p>}
        </section>
        {record && renderTraceability ? renderTraceability(dirty) : null}
      </div>
    </article>
  );
}
