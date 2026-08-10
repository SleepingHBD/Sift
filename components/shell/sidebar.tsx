"use client";

import Link from "next/link";
import {
  BookOpen,
  Home,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings,
  X,
} from "lucide-react";
import { useApp } from "@/components/app-provider";
import { cn } from "@/lib/utils";

type NavigationItem = {
  label: string;
  href: string;
  section: string;
  icon: typeof Home;
};

const primaryNavigation: NavigationItem[] = [
  { label: "Today", href: "/", section: "home", icon: Home },
  { label: "Notebooks", href: "/insight-builder", section: "insight-builder", icon: BookOpen },
  { label: "Radar", href: "/radar", section: "radar", icon: Radio },
  { label: "Library", href: "/evidence", section: "evidence", icon: Inbox },
];
const settingsItem: NavigationItem = { label: "Settings", href: "/settings", section: "settings", icon: Settings };

export function Sidebar({ activeSection }: { activeSection: string }) {
  const { collapsed, setCollapsed, mobileNavOpen, setMobileNavOpen, projects, activeProjectId } = useApp();
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const workspaceName = activeProject?.name ?? "My workspace";
  const workspaceInitials = (activeProject?.brand || activeProject?.name || "My").slice(0, 2).toUpperCase();

  const renderItem = (item: NavigationItem, cue?: string) => {
    const Icon = item.icon;
    const active = activeSection === item.section;
    return (
      <Link
        key={item.section}
        href={item.href}
        className={cn("sidebar-link", active && "sidebar-link--active")}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : cue ? `${item.label} — ${cue}` : undefined}
        onClick={() => setMobileNavOpen(false)}
      >
        <Icon size={18} strokeWidth={1.8} />
        <span className="sidebar-link__label">{item.label}</span>
        {cue ? <span className="sidebar-link__hint">{cue}</span> : null}
      </Link>
    );
  };

  return (
    <>
      {mobileNavOpen ? <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} /> : null}
      <aside className={cn("sidebar", collapsed && "sidebar--collapsed", mobileNavOpen && "sidebar--mobile-open")}>
        <div className="sidebar__brand-row">
          <Link href="/" className="wordmark" aria-label="Sift home">
            <span className="wordmark__mark">S</span>
            <span className="wordmark__text">sift<span>.</span></span>
          </Link>
          <button className="sidebar__mobile-close" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="sidebar__workspace">
          <div className="workspace-avatar">{workspaceInitials}</div>
          <div className="workspace-copy">
            <strong>{workspaceName}</strong>
            <span>{activeProject ? "Active project" : "Blank workspace"}</span>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Main navigation">
          <p className="sidebar__label">Your workspace</p>
          <div className="sidebar__primary">
            {primaryNavigation.map((item) => renderItem(item, !projects.length && item.section === "insight-builder" ? "Start here" : undefined))}
          </div>
        </nav>

        <div className="sidebar__footer">
          {renderItem(settingsItem)}
          <button className="sidebar__collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            <span>Collapse</span>
          </button>
        </div>
      </aside>
    </>
  );
}
