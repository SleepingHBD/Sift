"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";

export function BriefsPage() {
  const { projects, researchItems, setProjectDialogOpen } = useApp();
  return <div className="page"><PageIntro eyebrow="Creative brief builder" title="A brief with receipts." description="Build a creative brief from selected research, trends, insights, mentions, and inspiration—without losing the evidence trail." /><EmptyState icon={FileText} title="No briefs yet." description={projects.length && researchItems.length ? "Your workspace has enough structure to begin a brief. Brief generation will be added after the evidence workflow is connected." : "Create a project and add evidence before developing your first research-backed creative brief."} actions={<>{!projects.length ? <Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create project</Button> : null}<Link className="ui-button ui-button--secondary ui-button--md" href="/research">Add research</Link></>} /></div>;
}
