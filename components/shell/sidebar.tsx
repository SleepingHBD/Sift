"use client";

import Link from "next/link";
import {
  Building2,
  FileText,
  FolderKanban,
  Home,
  Images,
  Inbox,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings,
  Swords,
  TrendingUp,
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

const homeItem: NavigationItem = { label: "Home", href: "/", section: "home", icon: Home };
const settingsItem: NavigationItem = { label: "Settings", href: "/settings", section: "settings", icon: Settings };

const workflow = [
  {
    step: "01",
    label: "Set up",
    items: [
      { label: "Projects", href: "/projects", section: "projects", icon: FolderKanban },
      { label: "Brands", href: "/brands", section: "brands", icon: Building2 },
      { label: "Competitors", href: "/competitors", section: "competitors", icon: Swords },
    ],
  },
  { step: "02", label: "Discover", items: [{ label: "Radar", href: "/radar", section: "radar", icon: Radio }] },
  {
    step: "03",
    label: "Build evidence",
    items: [
      { label: "Evidence", href: "/evidence", section: "evidence", icon: Inbox },
      { label: "Inspiration", href: "/inspiration", section: "inspiration", icon: Images },
    ],
  },
  { step: "04", label: "Understand", items: [{ label: "Trends", href: "/trends", section: "trends", icon: TrendingUp }] },
  {
    step: "05",
    label: "Think",
    items: [
      { label: "Strategy Sessions", href: "/insight-builder", section: "insight-builder", icon: MessageCircle },
    ],
  },
  { step: "06", label: "Create", items: [{ label: "Briefs", href: "/briefs", section: "briefs", icon: FileText }] },
] satisfies Array<{ step: string; label: string; items: NavigationItem[] }>;

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
          <div className="sidebar__home-link">{renderItem(homeItem)}</div>
          <div className="sidebar__divider" />
          <p className="sidebar__label">Guided workflow</p>
          <div className="sidebar__workflow">
            {workflow.map((stage) => (
              <section className="sidebar-stage" key={stage.step} aria-labelledby={`sidebar-stage-${stage.step}`}>
                <p className="sidebar-stage__label" id={`sidebar-stage-${stage.step}`}>
                  <span>{stage.step}</span>
                  <strong>{stage.label}</strong>
                </p>
                <div className="sidebar-stage__items">
                  {stage.items.map((item) => renderItem(item, !projects.length && item.section === "projects" ? "Start here" : undefined))}
                </div>
              </section>
            ))}
          </div>
          <div className="sidebar__divider sidebar__divider--utility" />
          {renderItem(settingsItem)}
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
