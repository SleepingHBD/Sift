import { AppShell } from "@/components/shell/app-shell";
import { BrandsPage } from "@/components/pages/brands-page";
import { BriefsPage } from "@/components/pages/briefs-page";
import { CompetitorsPage } from "@/components/pages/competitors-page";
import { HomePage } from "@/components/pages/home-page";
import { InspirationPage } from "@/components/pages/inspiration-page";
import { ProjectsPage } from "@/components/pages/projects-page";
import { RadarPage } from "@/components/pages/radar-page";
import { ResearchPage } from "@/components/pages/research-page";
import { SettingsPage } from "@/components/pages/settings-page";
import { StrategyPage } from "@/components/pages/strategy-page";
import { TrendsPage } from "@/components/pages/trends-page";

const pages: Record<string, React.ComponentType> = {
  home: HomePage,
  radar: RadarPage,
  trends: TrendsPage,
  brands: BrandsPage,
  competitors: CompetitorsPage,
  inspiration: InspirationPage,
  research: ResearchPage,
  "strategy-ai": StrategyPage,
  briefs: BriefsPage,
  projects: ProjectsPage,
  settings: SettingsPage,
};

export function AppView({ section }: { section: string }) {
  const Page = pages[section] ?? HomePage;
  return <AppShell activeSection={section}><Page /></AppShell>;
}
