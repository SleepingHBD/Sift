"use client";

import { Bookmark, Grid2X2, Images, List, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Badge, Button, Card, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";

export function InspirationPage() {
  const { savedIds, toggleSaved, inspirationItems, addInspiration } = useApp();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("URL / article");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const filtered = useMemo(() => inspirationItems.filter((item) => `${item.title} ${item.brand} ${item.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [inspirationItems, query]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    addInspiration({ title, type, source, note });
    setTitle(""); setSource(""); setNote(""); setAdding(false);
  }

  return (
    <div className="page">
      <PageIntro eyebrow="Inspiration library" title="Keep the work that makes you think." description="Build a visual memory of campaigns, artifacts, and ideas—and remember why each one mattered."><Button variant="dark" onClick={() => setAdding(true)}><Plus size={16} />Add inspiration</Button></PageIntro>
      {!inspirationItems.length ? <EmptyState icon={Images} title="Your inspiration library is empty." description="Save a URL, campaign, article, screenshot reference, social post, or personal idea you want to revisit." actions={<Button variant="dark" onClick={() => setAdding(true)}><Plus size={15} />Add inspiration</Button>} /> : <>
        <div className="library-toolbar"><label className="library-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns, ideas, and notes" /><kbd>⌘ K</kbd></label><Button disabled title="Advanced filters are not available yet"><SlidersHorizontal size={15} />Filters later</Button><div className="view-toggle"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid view"><Grid2X2 size={16} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="List view"><List size={17} /></button></div></div>
        <div className={`library-grid library-grid--${view}`}>{filtered.map((item) => <Card className="library-item" key={item.id}><div className={`library-item__visual inspiration-visual--${item.palette}`}><span>{item.brand}</span><strong>{item.type.toUpperCase()}</strong><button aria-label="Save item" onClick={() => toggleSaved(item.id)}><Bookmark size={16} fill={savedIds.includes(item.id) ? "currentColor" : "none"} /></button></div><div className="library-item__copy"><div><Badge>{item.type}</Badge></div><h3>{item.title}</h3><p>{item.note || "No note added."}</p>{item.tags.length ? <div className="tag-row">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}<small>{item.source} · {item.savedAt}</small></div></Card>)}{!filtered.length ? <Card className="empty-state"><Search size={30} /><strong>No inspiration found</strong><span>Try another phrase or clear your search.</span><Button onClick={() => setQuery("")}>Clear search</Button></Card> : null}</div>
      </>}
      {adding ? <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="inspiration-dialog-title"><button className="radar-overlay__scrim" onClick={() => setAdding(false)} aria-label="Close" /><form className="workspace-dialog workspace-dialog--small" onSubmit={submit}><header><div><span className="workspace-dialog__icon"><Images size={19} /></span><div><p className="eyebrow">Add inspiration</p><h2 id="inspiration-dialog-title">Save what sparked something.</h2></div></div><button type="button" onClick={() => setAdding(false)} aria-label="Close"><X size={18} /></button></header><div className="workspace-dialog__body"><label><span>Title *</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you saving?" /></label><label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}><option>URL / article</option><option>Campaign</option><option>Image / screenshot reference</option><option>Social post</option><option>Personal idea</option></select></label><label><span>URL or source</span><input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Optional" /></label><label><span>Why it matters</span><textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Capture the useful thought, technique, or feeling." /></label></div><footer><Button type="button" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" variant="dark" disabled={!title.trim()}>Save inspiration</Button></footer></form></div> : null}
    </div>
  );
}
