"use client";

import { Check, Link2, LoaderCircle, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { strategyConnectionLabels } from "@/lib/strategy-pipeline/connections";
import type {
  SaveStrategyConnectionInput,
  StrategyConnectionRelationship,
  StrategySessionTurnRecord,
} from "@/lib/strategy-pipeline/types";

const relationships = ["related", "reinforces", "contradicts", "opens_question"] as const;

function turnExcerpt(turn: StrategySessionTurnRecord, length = 125) {
  const sourceTitle = turn.sources[0]?.source.title;
  const value = turn.metadata.capture_only === true && sourceTitle ? sourceTitle : turn.content;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}

export function NotebookConnectionDialog({
  sourceTurn,
  turns,
  onClose,
  onConfirm,
}: {
  sourceTurn: StrategySessionTurnRecord;
  turns: StrategySessionTurnRecord[];
  onClose: () => void;
  onConfirm: (input: SaveStrategyConnectionInput) => Promise<void>;
}) {
  const options = useMemo(() => turns.filter((turn) => turn.id !== sourceTurn.id), [sourceTurn.id, turns]);
  const [targetId, setTargetId] = useState("");
  const [relationship, setRelationship] = useState<StrategyConnectionRelationship>("related");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!targetId || saving) return;
    setSaving(true);
    setError("");
    try {
      await onConfirm({
        sessionId: sourceTurn.sessionId,
        projectId: sourceTurn.projectId,
        sourceTurnId: sourceTurn.id,
        targetTurnId: targetId,
        relationship,
        origin: "strategist",
        status: "accepted",
        rationale: note,
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "This connection could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="notebook-connection-title">
      <button className="radar-overlay__scrim" onClick={saving ? undefined : onClose} aria-label="Close connection dialog" />
      <section className="workspace-dialog notebook-connection-dialog">
        <header>
          <div><span className="workspace-dialog__icon"><Link2 size={19} /></span><div><p className="eyebrow">Notebook connection</p><h2 id="notebook-connection-title">Connect this thought.</h2><p>Choose one other entry. “Related” is enough if you are not sure yet.</p></div></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="workspace-dialog__body notebook-connection-dialog__body">
          <div className="notebook-connection-dialog__source"><span>Starting here</span><p>{turnExcerpt(sourceTurn, 180)}</p></div>
          <fieldset className="notebook-connection-dialog__targets">
            <legend>What does it connect to?</legend>
            <div>
              {options.map((turn) => <button type="button" className={targetId === turn.id ? "is-selected" : ""} key={turn.id} onClick={() => setTargetId(turn.id)} aria-pressed={targetId === turn.id}><span>{turn.role === "user" ? "Your thought" : turn.origin === "chatgpt_manual" ? "ChatGPT suggestion" : "Sift"}</span><p>{turnExcerpt(turn)}</p>{targetId === turn.id ? <Check size={15} /> : null}</button>)}
            </div>
          </fieldset>
          <fieldset className="notebook-connection-dialog__relationship">
            <legend>How are they connected?</legend>
            <div>{relationships.map((value) => <button type="button" className={relationship === value ? "is-selected" : ""} key={value} onClick={() => setRelationship(value)} aria-pressed={relationship === value}>{strategyConnectionLabels[value]}</button>)}</div>
          </fieldset>
          <details className="notebook-connection-dialog__note"><summary>Add a note <span>Optional</span></summary><label><span>Why do these belong together?</span><textarea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="A short reminder for your future self" /></label></details>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>

        <footer>
          <span>Nothing is interpreted or accepted on your behalf.</span>
          <div><Button type="button" onClick={onClose} disabled={saving}>Cancel</Button><Button type="button" variant="dark" disabled={!targetId || saving} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={14} /> : <Link2 size={14} />}{saving ? "Connecting…" : "Connect"}</Button></div>
        </footer>
      </section>
    </div>
  );
}
