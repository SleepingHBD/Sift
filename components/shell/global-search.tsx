"use client";

import Link from "next/link";
import { FileText, FolderKanban, Images, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";

export function GlobalSearch() {
  const { searchOpen, setSearchOpen, projects, inspirationItems, researchItems } = useApp();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => [
    { label: "Research", href: "/research", icon: FileText, items: researchItems.map((item) => ({ id: item.id, title: item.title, meta: item.publication })) },
    { label: "Inspiration", href: "/inspiration", icon: Images, items: inspirationItems.map((item) => ({ id: item.id, title: item.title, meta: item.brand })) },
    { label: "Projects", href: "/projects", icon: FolderKanban, items: projects.map((item) => ({ id: item.id, title: item.name, meta: item.focus })) },
  ], [inspirationItems, projects, researchItems]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(normalized)).slice(0, 4),
    })).filter((group) => group.items.length > 0);
  }, [groups, query]);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  if (!searchOpen) return null;

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Global search">
      <button className="search-overlay__scrim" aria-label="Close search" onClick={() => setSearchOpen(false)} />
      <div className="search-dialog">
        <div className="search-dialog__input">
          <Search size={20} />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your workspace" />
          <button aria-label="Close search" onClick={() => setSearchOpen(false)}><X size={17} /></button>
        </div>
        <div className="search-dialog__results">
          {filtered.length ? filtered.map((group) => {
            const Icon = group.icon;
            return <div className="search-group" key={group.label}><p>{group.label}</p>{group.items.map((item) => <Link key={item.id} href={group.href} onClick={() => setSearchOpen(false)}><span className="search-result__icon"><Icon size={16} /></span><span><strong>{item.title}</strong><small>{item.meta || "No description"}</small></span></Link>)}</div>;
          }) : <div className="search-empty"><Search size={28} /><strong>{query ? "No exact match" : "Your workspace is ready to search"}</strong><span>{query ? "Try a broader project, source, or topic." : "Results will appear as you add projects, research, inspiration, and evidence."}</span></div>}
        </div>
        <div className="search-dialog__footer"><span>Searching your workspace</span><span><kbd>esc</kbd> to close</span></div>
      </div>
    </div>
  );
}
