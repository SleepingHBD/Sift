"use client";

import Link from "next/link";
import { ArrowRight, FolderKanban, Plus } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge, Button, Card, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";

export function ProjectsPage() {
  const { projects, setProjectDialogOpen } = useApp();
  return (
    <div className="page">
      <PageIntro eyebrow="Projects" title="Organise the question, not just the files." description="Each workspace connects listening, research, evidence, strategy, and briefs around one real decision.">
        <Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={16} />New project</Button>
      </PageIntro>
      {!projects.length ? (
        <EmptyState icon={FolderKanban} title="No projects yet." description="Create a project to connect a brand, market, strategic objective, research, and evidence in one place." actions={<Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create your first project</Button>} />
      ) : (
        <div className="project-card-grid">
          {projects.map((project) => <Card className="project-card" key={project.id}>
            <div className="project-card__top"><span className="project-card__mark" style={{ background: project.accent }}>{(project.brand || project.name).slice(0, 2).toUpperCase()}</span><Badge>Project</Badge></div>
            <h2>{project.name}</h2><p>{project.description || project.focus || "No objective added yet."}</p>
            <div className="project-meta"><span>Market<strong>{project.market || "Not set"}</strong></span><span>Mentions<strong>{project.counts.mentions.toLocaleString()}</strong></span><span>Research<strong>{project.counts.research}</strong></span><span>Insights<strong>{project.counts.insights}</strong></span></div>
            {project.competitors?.length ? <div className="project-competitors"><span>Competitors</span><p>{project.competitors.join(" · ")}</p></div> : null}
            <Link href="/">Open workspace <ArrowRight size={14} /></Link>
          </Card>)}
          <button className="project-card project-card--new" onClick={() => setProjectDialogOpen(true)}><FolderKanban size={27} /><strong>Start another project</strong><span>Define a decision, market, and strategic question.</span><Badge><Plus size={12} />New project</Badge></button>
        </div>
      )}
    </div>
  );
}
