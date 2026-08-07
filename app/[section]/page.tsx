import { notFound } from "next/navigation";
import { AppView } from "@/components/app-view";

const sections = ["radar", "trends", "brands", "competitors", "inspiration", "research", "strategy-ai", "briefs", "projects", "settings"];

export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <AppView section={section} />;
}
