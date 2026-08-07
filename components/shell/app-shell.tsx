"use client";

import { GlobalSearch } from "./global-search";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ProjectDialog } from "@/components/workspace/project-dialog";

export function AppShell({ activeSection, children }: { activeSection: string; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar activeSection={activeSection} />
      <div className="app-frame">
        <Topbar />
        <main className="app-content">{children}</main>
      </div>
      <GlobalSearch />
      <ProjectDialog />
    </div>
  );
}
