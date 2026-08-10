"use client";

import Link from "next/link";
import { ArrowRight, CornerDownLeft, FolderKanban, Images, Inbox, Lightbulb, MessageCircleMore, Radio, Sparkles, TrendingUp } from "lucide-react";
import { FormEvent, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";

export function HomePage() {
  const { setProjectDialogOpen, openCaptureDialog, projects, researchItems } = useApp();
  const [question, setQuestion] = useState("");
  const [answerVisible, setAnswerVisible] = useState(false);
  const hasEvidence = researchItems.length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setAnswerVisible(true);
  }

  return (
    <div className="page page--home personal-home">
      <header className="blank-home-intro">
        <div><p className="eyebrow">Welcome to Sift</p><h1>Your creative intelligence workspace starts here.</h1><p>Track conversations, collect research, spot cultural signals, understand competitors, and turn evidence into strategy.</p></div>
        <span className="blank-home-intro__mark">S</span>
      </header>

      <section className="strategist-input-section strategist-input-section--blank">
        <div className="strategist-label"><Sparkles size={15} /><span>Ask your strategist</span><span className="workspace-mode-label">Your workspace</span></div>
        <form className="strategist-input" onSubmit={submit}>
          <textarea rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask your strategist…" aria-label="Ask your strategist" />
          <div className="strategist-input__footer"><span>{hasEvidence ? `${researchItems.length} research item${researchItems.length === 1 ? "" : "s"} available · ChatGPT handoff ready` : "Add evidence for workspace-backed analysis"}</span><button type="submit" aria-label="Ask question"><CornerDownLeft size={18} /></button></div>
        </form>
        {answerVisible ? <Card className="quick-answer general-ai-notice"><div className="quick-answer__icon"><Sparkles size={18} /></div><div><div className="quick-answer__label"><strong>{hasEvidence ? "Workspace-backed workflow" : "Evidence needed"}</strong><span>{hasEvidence ? "Uses your ChatGPT account" : "No finding generated"}</span></div><p>{hasEvidence ? "Open Strategy AI to retrieve the relevant sources, prepare a citation-ready ChatGPT prompt, and save the validated response back into Sift." : "I don’t have enough workspace evidence yet to answer this as a research-backed strategist. Add evidence and conversations first so future analysis can cite your sources."}</p><div className="general-ai-actions">{hasEvidence ? <Link href="/strategy-ai">Open Strategy AI <ArrowRight size={13} /></Link> : <><Link href="/evidence">Open Evidence <ArrowRight size={13} /></Link><Link href="/radar/#new-monitor">Create Radar monitor <ArrowRight size={13} /></Link></>}</div></div></Card> : null}
      </section>

      <section className="workspace-onboarding">
        <div><p className="eyebrow">Start building</p><h2>{projects.length ? "Keep building your evidence base." : "Four useful ways to begin."}</h2><p>Everything stays connected to the strategic question you are trying to answer.</p></div>
        <div className="workspace-onboarding__actions">
          <button onClick={() => setProjectDialogOpen(true)}><FolderKanban size={18} /><span><strong>{projects.length ? "Create another project" : "Create project"}</strong><small>Define the decision and context</small></span><ArrowRight size={14} /></button>
          <Link href="/radar/#new-monitor"><Radio size={18} /><span><strong>Create Radar monitor</strong><small>Define a conversation to collect</small></span><ArrowRight size={14} /></Link>
          <button onClick={() => openCaptureDialog("url")}><Inbox size={18} /><span><strong>Add evidence</strong><small>Capture research, notes, links, or files</small></span><ArrowRight size={14} /></button>
          <Link href="/inspiration"><Images size={18} /><span><strong>Save inspiration</strong><small>Keep work and ideas worth revisiting</small></span><ArrowRight size={14} /></Link>
        </div>
      </section>

      <div className="blank-dashboard-grid">
        <EmptyState compact icon={TrendingUp} eyebrow="Emerging trends" title="No trends detected yet." description="Connect a Radar source to begin discovering emerging conversations." actions={<Link className="text-link" href="/radar">Open Radar <ArrowRight size={13} /></Link>} />
        <EmptyState compact icon={MessageCircleMore} eyebrow="Conversation spikes" title="No conversations collected yet." description="Spikes will appear after a monitor has enough listening history." actions={<Link className="text-link" href="/radar">Open Radar <ArrowRight size={13} /></Link>} />
        <EmptyState compact icon={Images} eyebrow="Saved inspiration" title="Your inspiration library is empty." description="Save campaigns, posts, articles, visuals, and ideas you want to revisit." actions={<Link className="text-link" href="/inspiration">Add inspiration <ArrowRight size={13} /></Link>} />
        <EmptyState compact icon={FolderKanban} eyebrow="Competitor activity" title="No competitors are being tracked." description="Add competitors to a project to begin comparing their activity." actions={<button className="text-link" onClick={() => setProjectDialogOpen(true)}>Add competitor <ArrowRight size={13} /></button>} />
      </div>

      <EmptyState icon={Lightbulb} eyebrow="AI daily insight" title="Sift needs some evidence first." description="Add evidence or start monitoring conversations and Sift will surface strategic observations here." actions={<><Link className="text-link" href="/evidence">Open Evidence <ArrowRight size={13} /></Link><Link className="text-link" href="/radar/#new-monitor">Start monitoring <ArrowRight size={13} /></Link></>} />
    </div>
  );
}
