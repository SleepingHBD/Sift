"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Inbox, Plus, Radio } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/primitives";

export function HomePage() {
  const {
    activeProjectId,
    projects,
    setProjectDialogOpen,
    openCaptureDialog,
  } = useApp();
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];

  function captureSomething() {
    if (!activeProject) {
      setProjectDialogOpen(true);
      return;
    }
    openCaptureDialog();
  }

  return (
    <div className="page today-page">
      <header className="today-intro">
        <p className="eyebrow">Today</p>
        <h1>{activeProject ? "Pick up where you left off." : "Start with whatever is on your mind."}</h1>
        <p>Write an unfinished thought, paste something worth keeping, or follow a signal. Sift can help you connect it later.</p>
      </header>

      <section className="today-notebook" aria-labelledby="today-notebook-title">
        <span className="today-notebook__icon"><BookOpen size={23} /></span>
        <div className="today-notebook__copy">
          <p className="eyebrow">{activeProject ? "Continue notebook" : "Blank notebook"}</p>
          <h2 id="today-notebook-title">{activeProject?.name ?? "Give your first notebook a name."}</h2>
          <p>{activeProject
            ? "Your thoughts, sources, questions, and developing strategy stay together here. Nothing needs to be finished today."
            : "A name is enough to begin. Brand, market, competitors, and objectives can be added whenever they become useful."}</p>
        </div>
        {activeProject ? (
          <Link className="ui-button ui-button--dark ui-button--md" href="/insight-builder">Open notebook <ArrowRight size={15} /></Link>
        ) : (
          <Button variant="dark" onClick={() => setProjectDialogOpen(true)}><Plus size={15} />Create notebook</Button>
        )}
      </section>

      <section className="today-actions" aria-label="Other ways to continue">
        <button type="button" onClick={captureSomething}>
          <Inbox size={18} />
          <span><strong>Capture something</strong><small>Keep a source, note, image, or file.</small></span>
          <ArrowRight size={14} />
        </button>
        <Link href="/radar">
          <Radio size={18} />
          <span><strong>Check Radar</strong><small>See what changed in monitored conversations.</small></span>
          <ArrowRight size={14} />
        </Link>
        <Link href="/evidence">
          <BookOpen size={18} />
          <span><strong>Open Library</strong><small>Find anything you have collected.</small></span>
          <ArrowRight size={14} />
        </Link>
      </section>

      <p className="today-boundary">You do not need to classify or structure your thinking before writing it down.</p>
    </div>
  );
}
