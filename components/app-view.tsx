import { AppShell } from "@/components/shell/app-shell";
import { BrandsPage } from "@/components/pages/brands-page";
import { BriefsPage } from "@/components/pages/briefs-page";
import { CompetitorsPage } from "@/components/pages/competitors-page";
import { EvidencePage } from "@/components/pages/evidence-page";
import { HomePage } from "@/components/pages/home-page";
import { InspirationPage } from "@/components/pages/inspiration-page";
import { ProjectsPage } from "@/components/pages/projects-page";
import { RadarPage } from "@/components/pages/radar-page";
import { SettingsPage } from "@/components/pages/settings-page";
import { StrategyPage } from "@/components/pages/strategy-page";
import { StrategySessionsPage } from "@/components/pages/strategy-sessions-page";
import { TrendsPage } from "@/components/pages/trends-page";

const pages: Record<string, React.ComponentType> = {
  home: HomePage,
  radar: RadarPage,
  evidence: EvidencePage,
  trends: TrendsPage,
  brands: BrandsPage,
  competitors: CompetitorsPage,
  inspiration: InspirationPage,
  "strategy-ai": StrategyPage,
  "insight-builder": StrategySessionsPage,
  briefs: BriefsPage,
  projects: ProjectsPage,
  settings: SettingsPage,
};

export function AppView({ section }: { section: string }) {
  if (section === "research") {
    return <AppShell activeSection="evidence"><EvidencePage initialKind="research" /></AppShell>;
  }
  if (section === "inspiration") {
    return <AppShell activeSection="evidence"><InspirationPage /></AppShell>;
  }
  if (section === "trends") {
    return <AppShell activeSection="radar"><TrendsPage /></AppShell>;
  }
  if (["brands", "competitors", "projects", "strategy-ai", "briefs"].includes(section)) {
    const Page = pages[section] ?? HomePage;
    return <AppShell activeSection="insight-builder"><Page /></AppShell>;
  }
  const Page = pages[section] ?? HomePage;
  return <AppShell activeSection={section}><Page /></AppShell>;
}
