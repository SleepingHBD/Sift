"use client";

import { BookOpen, FilePlus2, FileText, Plus, Search, Upload, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Badge, Button, Card, PageIntro, SectionHeader } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";

export function ResearchPage() {
  const { researchItems, addResearch } = useApp();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Article");
  const [source, setSource] = useState("");
  const [summary, setSummary] = useState("");
  const filtered = useMemo(() => researchItems.filter((item) => `${item.title} ${item.publication} ${item.summary} ${item.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [query, researchItems]);

  function openAdd(nextType: string) { setType(nextType); setAdding(true); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    addResearch({ title, type, source, summary });
    setTitle(""); setSource(""); setSummary(""); setAdding(false);
  }

  return <div className="page">
    <PageIntro eyebrow="Research library" title="Evidence, with a point of view." description="Collect source material, annotate what matters, and connect every strategic leap back to proof."><Button onClick={() => openAdd("URL")}><FilePlus2 size={16} />Add URL</Button><Button variant="dark" onClick={() => openAdd("Note")}><Plus size={16} />Add note</Button></PageIntro>
    {!researchItems.length ? <EmptyState icon={BookOpen} title="Start building your knowledge base." description="Add an article, URL, report, statistic, quote, or personal note. Nothing becomes a finding until you supply the evidence." actions={<><Button variant="dark" onClick={() => openAdd("Article")}><FileText size={15} />Add article</Button><Button onClick={() => openAdd("URL")}><FilePlus2 size={15} />Add URL</Button><Button onClick={() => openAdd("Note")}><Plus size={15} />Add note</Button><Button disabled title="File uploads require storage configuration"><Upload size={15} />Upload later</Button></>} /> : <>
      <div className="research-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search research, quotes, statistics, and notes" /><span>Your workspace</span></div>
      <section className="research-list-section"><SectionHeader eyebrow="Recently added" title="Source library" description={`${filtered.length} source${filtered.length === 1 ? "" : "s"}`} /><div className="research-list">{filtered.map((item) => <Card className="research-row" key={item.id}><span className="research-row__icon">{item.type === "Report" ? <BookOpen size={19} /> : <FileText size={19} />}</span><div className="research-row__main"><div><Badge>{item.type}</Badge><span>{item.date}</span></div><h3>{item.title}</h3><p>{item.summary || "No summary added."}</p>{item.tags.length ? <div className="tag-row">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}</div><aside><span>{item.publication}</span><small>{item.collection}</small></aside></Card>)}{!filtered.length ? <Card className="empty-state"><Search size={30} /><strong>No research matches that search</strong><Button onClick={() => setQuery("")}>Clear search</Button></Card> : null}</div></section>
    </>}
    {adding ? <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="research-dialog-title"><button className="radar-overlay__scrim" onClick={() => setAdding(false)} aria-label="Close" /><form className="workspace-dialog workspace-dialog--small" onSubmit={submit}><header><div><span className="workspace-dialog__icon"><BookOpen size={19} /></span><div><p className="eyebrow">Add research</p><h2 id="research-dialog-title">Capture a source and its value.</h2></div></div><button type="button" onClick={() => setAdding(false)} aria-label="Close"><X size={18} /></button></header><div className="workspace-dialog__body"><label><span>Title *</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Source or note title" /></label><label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}><option>Article</option><option>URL</option><option>Report</option><option>Note</option><option>Statistic</option><option>Quote</option></select></label><label><span>URL / publication</span><input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Optional" /></label><label><span>Key finding or note</span><textarea rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What matters here, and why?" /></label></div><footer><Button type="button" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" variant="dark" disabled={!title.trim()}>Add research</Button></footer></form></div> : null}
  </div>;
}
