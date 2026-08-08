"use client";

import { GlobalSearch } from "./global-search";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useAuth } from "@/components/auth/auth-provider";
import { WorkspaceAccessGate } from "@/components/auth/workspace-access-gate";
import { ProjectDialog } from "@/components/workspace/project-dialog";
import { CaptureEvidenceDialog } from "@/components/evidence/capture-evidence-dialog";

export function AppShell({ activeSection, children, requireAuth = true }: { activeSection: string; children: React.ReactNode; requireAuth?: boolean }) {
  const { status } = useAuth();
  if (requireAuth && status !== "authenticated") return <WorkspaceAccessGate />;

  return (
    <div className="app-shell">
      <Sidebar activeSection={activeSection} />
      <div className="app-frame">
        <Topbar />
        <main className="app-content">{children}</main>
      </div>
      {status === "authenticated" ? <GlobalSearch /> : null}
      {status === "authenticated" ? <ProjectDialog /> : null}
      {status === "authenticated" ? <CaptureEvidenceDialog /> : null}
    </div>
  );
}
