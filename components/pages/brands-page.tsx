"use client";

import { Building2, Plus } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge, Button, Card, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";

export function BrandsPage() {
  const { projects, setProjectDialogOpen } = useApp();
  const brandProjects = projects.filter((project) => project.brand.trim());
  return <div className="page"><PageIntro eyebrow="Brand workspace" title="Keep the work brand-literate." description="Add brand and client context so signals, insights, and recommendations remain strategically credible."><Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={16} />Add brand</Button></PageIntro>{brandProjects.length ? <div className="brand-empty-grid">{brandProjects.map((project) => <Card className="personal-brand-card" key={project.id}><span className="project-card__mark" style={{ background: project.accent }}>{project.brand.slice(0, 2).toUpperCase()}</span><div><Badge>Brand context</Badge><h2>{project.brand}</h2><p>{project.description || "No brand context added yet."}</p><small>{project.market || "Market not set"} · {project.name}</small></div></Card>)}</div> : <EmptyState icon={Building2} title="No brands added yet." description="Create a project with a brand or client to establish the context your strategy should work within." actions={<Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Add brand</Button>} />}</div>;
}
