"use client";

import { BookOpenText, Check, Image as ImageIcon, LoaderCircle, Radio, Search, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { searchEvidencePage } from "@/lib/evidence/search";
import type { EvidenceReference } from "@/lib/evidence/reference";

type SourceKind = "all" | EvidenceReference["kind"];

const filters: Array<{ value: SourceKind; label: string }> = [
  { value: "all", label: "All" },
  { value: "mention", label: "Radar" },
  { value: "research", label: "Research" },
  { value: "inspiration", label: "Inspiration" },
];

function sourceIcon(kind: EvidenceReference["kind"]) {
  if (kind === "mention") return Radio;
  if (kind === "inspiration") return ImageIcon;
  return BookOpenText;
}

function sourceKey(source: EvidenceReference) {
  return `${source.kind}:${source.cloudId ?? source.id}`;
}

export function NotebookSourcePicker({
  projectId,
  selected,
  onToggle,
  onClose,
}: {
  projectId: string;
  selected: EvidenceReference[];
  onToggle: (source: EvidenceReference) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<EvidenceReference[]>([]);
  const [kind, setKind] = useState<SourceKind>("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError("");
      searchEvidencePage({
        projectId,
        search,
        kind,
        sort: "newest",
        pageSize: 40,
      }).then((page) => {
        if (active) setItems(page.items);
      }).catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Your Library could not be loaded.");
      }).finally(() => {
        if (active) setLoading(false);
      });
    });
    return () => { active = false; };
  }, [kind, projectId, search]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(query.trim());
  }

  const selectedKeys = new Set(selected.map(sourceKey));

  return (
    <div className="radar-overlay notebook-source-picker" role="dialog" aria-modal="true" aria-labelledby="notebook-source-picker-title">
      <button className="radar-overlay__scrim" onClick={onClose} aria-label="Close Library" />
      <section className="notebook-source-picker__panel">
        <header>
          <div><p className="eyebrow">Your Library</p><h2 id="notebook-source-picker-title">Attach what already matters.</h2><p>Choose saved evidence for this notebook entry. Nothing is copied or changed.</p></div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <form className="notebook-source-picker__search" onSubmit={submitSearch}>
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this notebook's sources" aria-label="Search Library sources" />
          <Button size="sm">Search</Button>
        </form>

        <div className="notebook-source-picker__filters" aria-label="Filter sources">
          {filters.map((filter) => <button className={kind === filter.value ? "is-active" : ""} key={filter.value} type="button" onClick={() => setKind(filter.value)}>{filter.label}</button>)}
        </div>

        <div className="notebook-source-picker__results">
          {loading ? <div className="notebook-source-picker__state"><LoaderCircle className="spin" size={20} /><span>Opening your Library…</span></div> : null}
          {!loading && error ? <div className="notebook-source-picker__state is-error"><strong>Library unavailable</strong><span>{error}</span></div> : null}
          {!loading && !error && !items.length ? <div className="notebook-source-picker__state"><BookOpenText size={20} /><strong>No matching sources yet.</strong><span>Capture a link or file from the composer, or change this search.</span></div> : null}
          {!loading && !error ? items.map((item) => {
            const Icon = sourceIcon(item.kind);
            const active = selectedKeys.has(sourceKey(item));
            return <button className={`notebook-source-picker__result${active ? " is-selected" : ""}`} key={sourceKey(item)} type="button" onClick={() => onToggle(item)} aria-pressed={active}>
              <span className="notebook-source-picker__result-icon"><Icon size={16} /></span>
              <span><strong>{item.title}</strong><small>{item.sourceLabel} · {new Date(item.capturedAt).toLocaleDateString()}</small><span>{item.excerpt || item.initialInterpretation || item.notes || "Saved source"}</span></span>
              {active ? <span className="notebook-source-picker__check"><Check size={14} /></span> : <Badge>{item.kind === "mention" ? "Radar" : item.kind}</Badge>}
            </button>;
          }) : null}
        </div>

        <footer><span>{selected.length ? `${selected.length} attached to this entry` : "Choose only what supports this thought."}</span><Button variant="dark" onClick={onClose}>Done</Button></footer>
      </section>
    </div>
  );
}
