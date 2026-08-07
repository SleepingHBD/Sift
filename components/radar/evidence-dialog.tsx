"use client";

import { BookOpen, FileText, FolderKanban, Lightbulb, Plus, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Badge, Button } from "@/components/ui/primitives";
import type { EvidenceDestination, RadarEvidenceLink, RadarMention } from "@/lib/radar/types";

const destinations: { id: EvidenceDestination; label: string; description: string; icon: typeof Lightbulb }[] = [
  { id: "insight", label: "Existing insight", description: "Attach this source to an insight already in the workspace.", icon: Lightbulb },
  { id: "new-insight", label: "New insight", description: "Create an insight starting point with this mention as evidence.", icon: Plus },
  { id: "research", label: "Research collection", description: "Keep the mention in a named research theme.", icon: BookOpen },
  { id: "project", label: "Project", description: "Associate the evidence with a project workspace.", icon: FolderKanban },
  { id: "brief", label: "Brief", description: "Attach the mention to a working creative brief.", icon: FileText },
];

export function EvidenceDialog({ mention, onClose, onSave }: { mention: RadarMention | null; onClose: () => void; onSave: (link: RadarEvidenceLink) => void }) {
  const { projects, researchItems } = useApp();
  const [destination, setDestination] = useState<EvidenceDestination>("insight");
  const [targetId, setTargetId] = useState("");
  const [newInsight, setNewInsight] = useState("");
  const [note, setNote] = useState("");

  const targetOptions = useMemo(() => {
    if (destination === "insight") return [];
    if (destination === "research") return researchItems.map((item) => ({ id: item.id, label: item.title }));
    if (destination === "project") return projects.map((item) => ({ id: item.id, label: item.name }));
    if (destination === "brief") return [];
    return [];
  }, [destination, projects, researchItems]);

  if (!mention) return null;

  function chooseDestination(next: EvidenceDestination) {
    setDestination(next);
    if (next === "insight") setTargetId("");
    if (next === "research") setTargetId(researchItems[0]?.id ?? "");
    if (next === "project") setTargetId(projects[0]?.id ?? "");
    if (next === "brief") setTargetId("");
    if (next === "new-insight") setTargetId("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!mention) return;
    const label = destination === "new-insight" ? newInsight.trim() : targetOptions.find((item) => item.id === targetId)?.label;
    if (!label) return;
    onSave({
      id: `evidence-${Date.now()}`,
      mentionId: mention.id,
      destination,
      destinationId: destination === "new-insight" ? undefined : targetId,
      destinationLabel: label,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    onClose();
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="evidence-dialog-title">
      <button className="radar-overlay__scrim" onClick={onClose} aria-label="Close evidence dialog" />
      <form className="evidence-dialog" onSubmit={submit}>
        <header><div><p className="eyebrow">Use as evidence</p><h2 id="evidence-dialog-title">Where should this source contribute?</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="evidence-dialog__source"><p>“{mention.content}”</p><span>{mention.sourceLabel} · {mention.author}</span></div>
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
        <footer><span>The original mention ID and excerpt remain attached.</span><div><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="dark" disabled={destination === "new-insight" ? !newInsight.trim() : !targetId}>Link evidence</Button></div></footer>
      </form>
    </div>
  );
}
