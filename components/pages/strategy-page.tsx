"use client";

import Link from "next/link";
import { ArrowRight, BookOpenCheck, MessageCircle, Plus, Radio, Send, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Badge, Button, Card, PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";

export function StrategyPage() {
  const { researchItems } = useApp();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  function ask(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setMessages((current) => [...current, question.trim()]);
    setQuestion("");
  }

  return <div className="page strategy-page"><PageIntro eyebrow="Strategy AI" title="Turn signal into direction." description="Use general strategic framing now, then move into workspace-backed analysis when your evidence base is ready."><Button variant="dark" onClick={() => { setMessages([]); setQuestion(""); }}><Plus size={16} />New session</Button></PageIntro><div className="strategy-empty-workbench"><Card className="strategy-chat strategy-chat--blank"><div className="strategy-chat__header"><div><span className="ai-orb"><Sparkles size={18} /></span><div><strong>Sift Strategist</strong><span>Your workspace</span></div></div><Badge>{researchItems.length} evidence sources</Badge></div><div className="strategy-chat__messages"><div className="chat-message chat-message--assistant"><div className="chat-avatar"><Sparkles size={15} /></div><div><p className="chat-kicker">Workspace evidence status</p><h3>I don’t have enough workspace evidence yet to answer as a research-backed strategist.</h3><p>Add research or collect conversations in Radar. Until then, responses are treated as general strategic framing and will not be presented as findings.</p><div className="workspace-analysis-actions"><Link href="/research">Add research <ArrowRight size={13} /></Link><Link href="/radar">Create Radar monitor <ArrowRight size={13} /></Link></div></div></div>{messages.map((message, index) => <div key={`${message}-${index}`}><div className="chat-message chat-message--user"><span>{message}</span></div><div className="chat-message chat-message--assistant chat-message--compact"><div className="chat-avatar"><Sparkles size={15} /></div><div><p className="chat-kicker">General response · Not workspace-backed</p><p>Use this as a framing exercise: clarify the behaviour you want to understand, identify the human tension behind it, and list what evidence would confirm or challenge the opportunity. No claim here is based on your workspace yet.</p></div></div></div>)}</div><form className="strategy-chat__input" onSubmit={ask}><MessageCircle size={17} /><textarea rows={1} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a general strategy question…" /><button aria-label="Send question"><Send size={16} /></button></form></Card><aside className="strategy-evidence-empty"><BookOpenCheck size={21} /><h2>Workspace-backed analysis</h2><p>Requires stored research, mentions, insights, or other cited evidence.</p><Link href="/research">Build evidence base <ArrowRight size={13} /></Link></aside></div><section className="insights-section"><EmptyState icon={Radio} title="No strategic insights yet." description="Insights will appear only after they can be connected to source evidence from your workspace." actions={<><Link className="text-link" href="/research">Add research <ArrowRight size={13} /></Link><Link className="text-link" href="/radar">Start monitoring <ArrowRight size={13} /></Link></>} /></section></div>;
}
