"use client";

import { BookOpen, FolderKanban, Images, Lightbulb, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Badge, Button } from "@/components/ui/primitives";
import type { EvidenceDestination, RadarEvidenceLink, RadarMention } from "@/lib/radar/types";

const destinations: { id: EvidenceDestination; label: string; description: string; icon: typeof Lightbulb }[] = [
  { id: "new-insight", label: "Insight seed", description: "Keep a research-backed starting point for the future insight builder.", icon: Lightbulb },
  { id: "research", label: "Research item", description: "Connect this source to research already saved in the workspace.", icon: BookOpen },
  { id: "inspiration", label: "Inspiration item", description: "Connect the conversation to a saved creative reference.", icon: Images },
  { id: "project", label: "Project", description: "Associate the evidence with a project workspace.", icon: FolderKanban },
];

interface EvidenceDialogProps {
  mention: RadarMention | null;
  onClose: () => void;
  onSave: (link: RadarEvidenceLink) => Promise<RadarEvidenceLink>;
}

export function EvidenceDialog({ mention, onClose, onSave }: EvidenceDialogProps) {
  const { projects, researchItems, inspirationItems } = useApp();
  const [destination, setDestination] = useState<EvidenceDestination>("new-insight");
  const [targetId, setTargetId] = useState("");
  const [newInsight, setNewInsight] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const targetOptions = useMemo(() => {
    if (destination === "research") return researchItems.map((item) => ({ id: item.id, label: item.title }));
    if (destination === "inspiration") return inspirationItems.map((item) => ({ id: item.id, label: item.title }));
    if (destination === "project") return projects.map((item) => ({ id: item.id, label: item.name }));
    return [];
  }, [destination, inspirationItems, projects, researchItems]);

  if (!mention) return null;

  function chooseDestination(next: EvidenceDestination) {
    setDestination(next);
    setError("");
    if (next === "research") setTargetId(researchItems[0]?.id ?? "");
    else if (next === "inspiration") setTargetId(inspirationItems[0]?.id ?? "");
    else if (next === "project") setTargetId(projects[0]?.id ?? "");
    else setTargetId("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!mention || saving) return;
    const label = destination === "new-insight" ? newInsight.trim() : targetOptions.find((item) => item.id === targetId)?.label;
    if (!label) return;
    setSaving(true);
    setError("");
    try {
      await onSave({
        id: `evidence-${Date.now()}`,
        mentionId: mention.id,
        destination,
        destinationId: destination === "new-insight" ? undefined : targetId,
        destinationLabel: label,
        note: note.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence could not be linked.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="evidence-dialog-title">
      <button className="radar-overlay__scrim" onClick={onClose} aria-label="Close evidence dialog" />
      <form className="evidence-dialog" onSubmit={(event) => void submit(event)}>
        <header><div><p className="eyebrow">Use as evidence</p><h2 id="evidence-dialog-title">Where should this source contribute?</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="evidence-dialog__source"><p>&ldquo;{mention.content}&rdquo;</p><span>{mention.sourceLabel} &middot; {mention.author}</span></div>
        <div className="evidence-destination-grid">
          {destinations.map((item) => {
            const Icon = item.icon;
            return <button type="button" key={item.id} className={destination === item.id ? "active" : ""} onClick={() => chooseDestination(item.id)}><Icon size={17} /><span><strong>{item.label}</strong><small>{item.description}</small></span>{destination === item.id ? <Badge>Selected</Badge> : null}</button>;
          })}
        </div>
        {destination === "new-insight" ? (
          <label className="evidence-target-field"><span>Working insight name</span><input value={newInsight} onChange={(event) => setNewInsight(event.target.value)} placeholder="e.g. Belonging needs a low-pressure first step" /></label>
        ) : (
          <label className="evidence-target-field"><span>Destination</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={!targetOptions.length}><option value="">{targetOptions.length ? "Choose a destination" : "No destinations available"}</option>{targetOptions.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
        )}
        <label className="evidence-target-field"><span>Evidence note</span><textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why is this mention useful?" /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <footer><span>The original mention and excerpt remain attached in Supabase.</span><div><Button type="button" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" variant="dark" disabled={saving || (destination === "new-insight" ? !newInsight.trim() : !targetId)}>{saving ? "Linking..." : "Link evidence"}</Button></div></footer>
      </form>
    </div>
  );
}
