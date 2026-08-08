"use client";

import Link from "next/link";
import { Bell, ChevronDown, Menu, Moon, Plus, Search, Sun } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useApp } from "@/components/app-provider";

export function Topbar() {
  const { status, user } = useAuth();
  const {
    theme,
    toggleTheme,
    activeProjectId,
    setActiveProjectId,
    setSearchOpen,
    setCaptureDialogOpen,
    setMobileNavOpen,
    projects,
  } = useApp();
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const accountInitials = status === "authenticated"
    ? String(user?.user_metadata?.user_name || user?.email || "GH").slice(0, 2).toUpperCase()
    : status === "anonymous" ? "?" : "SI";

  return (
    <header className="topbar">
      <div className="topbar__left">
        <button className="topbar__icon mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>
          <Menu size={19} />
        </button>
        <div className="project-select-wrap">
          <span className="project-color" style={{ background: activeProject?.accent ?? "var(--border-strong)" }} />
          <select value={activeProject?.id ?? ""} disabled={!projects.length} onChange={(event) => setActiveProjectId(event.target.value)} aria-label="Active project">
            {!projects.length ? <option value="">No active project</option> : null}
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <ChevronDown size={14} />
        </div>
      </div>

      <div className="topbar__actions">
        <button className="topbar-capture-button" onClick={() => setCaptureDialogOpen(true)} aria-label="Capture evidence" title="Capture evidence">
          <Plus size={16} />
          <span>Capture evidence</span>
        </button>
        <button className="global-search-button" onClick={() => setSearchOpen(true)}>
          <Search size={16} />
          <span>Search everything</span>
          <kbd>⌘ K</kbd>
        </button>
        <button className="topbar__icon" aria-label="Toggle theme" onClick={toggleTheme}>
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="topbar__icon topbar__notification" aria-label="Notifications unavailable" disabled title="Notifications are not configured yet">
          <Bell size={18} />
          <span />
        </button>
        <Link className="user-avatar" href="/account" aria-label={status === "authenticated" ? "Open account" : "Sign in to Sift"}>{accountInitials}</Link>
      </div>
    </header>
  );
}
