"use client";

import Link from "next/link";
import {
  Building2,
  FileText,
  FolderKanban,
  Home,
  Images,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings,
  Sparkles,
  Swords,
  TrendingUp,
  X,
} from "lucide-react";
import { useApp } from "@/components/app-provider";
import { cn } from "@/lib/utils";

const primaryNav = [
  { label: "Home", href: "/", section: "home", icon: Home },
  { label: "Radar", href: "/radar", section: "radar", icon: Radio },
  { label: "Trends", href: "/trends", section: "trends", icon: TrendingUp },
  { label: "Brands", href: "/brands", section: "brands", icon: Building2 },
  { label: "Competitors", href: "/competitors", section: "competitors", icon: Swords },
  { label: "Inspiration", href: "/inspiration", section: "inspiration", icon: Images },
  { label: "Research", href: "/research", section: "research", icon: Library },
  { label: "Strategy AI", href: "/strategy-ai", section: "strategy-ai", icon: Sparkles },
  { label: "Briefs", href: "/briefs", section: "briefs", icon: FileText },
];

const utilityNav = [
  { label: "Projects", href: "/projects", section: "projects", icon: FolderKanban },
  { label: "Settings", href: "/settings", section: "settings", icon: Settings },
];

export function Sidebar({ activeSection }: { activeSection: string }) {
  const { collapsed, setCollapsed, mobileNavOpen, setMobileNavOpen, projects, activeProjectId } = useApp();
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const workspaceName = activeProject?.name ?? "My workspace";
  const workspaceInitials = (activeProject?.brand || activeProject?.name || "My").slice(0, 2).toUpperCase();

  const renderItem = (item: (typeof primaryNav)[number]) => {
    const Icon = item.icon;
    const active = activeSection === item.section;
    return (
      <Link
        key={item.section}
        href={item.href}
        className={cn("sidebar-link", active && "sidebar-link--active")}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        onClick={() => setMobileNavOpen(false)}
      >
        <Icon size={18} strokeWidth={1.8} />
        <span className="sidebar-link__label">{item.label}</span>
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
          <p className="sidebar__label">Intelligence</p>
          {primaryNav.map(renderItem)}
          <div className="sidebar__divider" />
          <p className="sidebar__label">Workspace</p>
          {utilityNav.map(renderItem)}
        </nav>

        <div className="sidebar__footer">
          <button className="sidebar__collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            <span>Collapse</span>
          </button>
        </div>
      </aside>
    </>
  );
}
