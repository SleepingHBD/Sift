import { AppShell } from "@/components/shell/app-shell";
import { BrandsPage } from "@/components/pages/brands-page";
import { BriefsPage } from "@/components/pages/briefs-page";
import { CompetitorsPage } from "@/components/pages/competitors-page";
import { EvidencePage } from "@/components/pages/evidence-page";
import { HomePage } from "@/components/pages/home-page";
import { InsightBuilderPage } from "@/components/pages/insight-builder-page";
import { InspirationPage } from "@/components/pages/inspiration-page";
import { ProjectsPage } from "@/components/pages/projects-page";
import { RadarPage } from "@/components/pages/radar-page";
import { SettingsPage } from "@/components/pages/settings-page";
import { StrategyPage } from "@/components/pages/strategy-page";
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
  "insight-builder": InsightBuilderPage,
  briefs: BriefsPage,
  projects: ProjectsPage,
  settings: SettingsPage,
};

export function AppView({ section }: { section: string }) {
  if (section === "research") {
    return <AppShell activeSection="evidence"><EvidencePage initialKind="research" /></AppShell>;
  }
  const Page = pages[section] ?? HomePage;
  return <AppShell activeSection={section}><Page /></AppShell>;
}
