"use client";

import { Plus, Swords } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge, Button, Card, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";

export function CompetitorsPage() {
  const { projects, setProjectDialogOpen } = useApp();
  const tracked = [...new Set(projects.flatMap((project) => project.competitors ?? []))];
  return <div className="page"><PageIntro eyebrow="Competitor intelligence" title="Find the space nobody owns yet." description="Add competitors to a project, then compare their activity when real monitoring evidence becomes available."><Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={16} />Add competitor</Button></PageIntro>{tracked.length ? <div className="personal-competitor-list"><div className="personal-competitor-list__head"><span>Competitor</span><span>Status</span><span>Evidence</span></div>{tracked.map((name) => <Card key={name}><span className="mini-brand-mark">{name.slice(0, 2).toUpperCase()}</span><strong>{name}</strong><Badge>Not monitored</Badge><span>No listening data yet</span></Card>)}</div> : <EmptyState icon={Swords} title="No competitors being tracked." description="Add competitors while creating a project. Metrics will remain empty until genuine monitoring data exists." actions={<Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Add competitor</Button>} />}</div>;
}
