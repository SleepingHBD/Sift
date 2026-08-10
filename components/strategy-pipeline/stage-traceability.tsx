"use client";

import { AlertTriangle, Check, ChevronRight, CircleHelp, GitBranch, History, LoaderCircle, LockKeyhole, Network, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { cleanResearchGaps, dependencyRelationshipLabel, stageApprovalChecks, stageDefinition, upstreamStageTrail } from "@/lib/strategy-pipeline/model";
import type {
  CreateStrategyAlternativeInput,
  CreateStrategyDependencyInput,
  StrategyAlternativeStatus,
  StrategyConfidence,
  StrategyDependencyRelationship,
  StrategyStageAlternativeRecord,
  StrategyStageRecord,
  StrategyStageStatus,
  UpdateStrategyAlternativeInput,
} from "@/lib/strategy-pipeline/types";

interface StageTraceabilityProps {
  record: StrategyStageRecord;
  stages: StrategyStageRecord[];
  hasUnsavedClaimChanges: boolean;
  onSaveUncertainty: (confidence: StrategyConfidence, gaps: string[]) => Promise<void>;
  onSetStatus: (status: StrategyStageStatus, note?: string) => Promise<void>;
  onCreateAlternative: (input: Omit<CreateStrategyAlternativeInput, "projectId" | "stageId">) => Promise<void>;
  onUpdateAlternative: (input: Omit<UpdateStrategyAlternativeInput, "projectId" | "stageId">) => Promise<void>;
  onAddDependency: (input: Omit<CreateStrategyDependencyInput, "projectId" | "stageId">) => Promise<void>;
  onRemoveDependency: (dependencyId: string) => Promise<void>;
}

type PendingAction = "uncertainty" | "status" | "alternative" | "dependency" | "";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusExplanation(status: StrategyStageStatus) {
  if (status === "approved") return "Approved means you accept this version as a dependable part of the argument.";
  if (status === "ready") return "Ready means the claim is complete enough for your final evidence check.";
  return "Draft means the claim is still being developed or has changed since approval.";
}

function stateText(value: Record<string, unknown>) {
  const content = typeof value.content === "string" ? value.content.trim() : "";
  if (content) return content;
  const status = typeof value.status === "string" ? value.status : "";
  return status ? `Status: ${status}` : "No text snapshot";
}

export function StrategyStageTraceability({
  record,
  stages,
  hasUnsavedClaimChanges,
  onSaveUncertainty,
  onSetStatus,
  onCreateAlternative,
  onUpdateAlternative,
  onAddDependency,
  onRemoveDependency,
}: StageTraceabilityProps) {
  const [confidence, setConfidence] = useState(record.confidence);
  const [gaps, setGaps] = useState(record.researchGaps.join("\n"));
  const [approvalNote, setApprovalNote] = useState(record.approvalNote ?? "");
  const [alternativeOpen, setAlternativeOpen] = useState(false);
  const [dependencyOpen, setDependencyOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction>("");
  const [error, setError] = useState("");
  const contradictions = record.sources.filter((source) => source.relationship === "contradict");
  const approvalChecks = stageApprovalChecks(record, stages);
  const approvalReady = approvalChecks.every((check) => check.passed) && !hasUnsavedClaimChanges;
  const earlierStages = useMemo(
    () => stages.filter((stage) => stage.position < record.position),
    [record.position, stages],
  );
  const uncertaintyDirty = confidence !== record.confidence
    || gaps.trim() !== record.researchGaps.join("\n").trim();
  const upstreamTrail = useMemo(() => upstreamStageTrail(record, stages), [record, stages]);
  const upstreamSourceCount = useMemo(() => new Set(upstreamTrail.flatMap((stage) => stage.sources.map((source) => `${source.source.kind}:${source.source.id}`))).size, [upstreamTrail]);

  async function run(action: PendingAction, work: () => Promise<void>) {
    setPending(action);
    setError("");
    try { await work(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "This change could not be saved."); }
    finally { setPending(""); }
  }

  async function changeStatus(status: StrategyStageStatus) {
    await run("status", () => onSetStatus(status, status === "approved" ? approvalNote : undefined));
  }

  return (
    <section className="stage-traceability" aria-label={`${stageDefinition(record.kind).label} uncertainty and traceability`}>
      {contradictions.length ? (
        <div className="stage-contradiction"><AlertTriangle size={16} /><div><strong>This claim is challenged by {contradictions.length} linked {contradictions.length === 1 ? "source" : "sources"}.</strong><span>Review the contradictory evidence before marking the stage ready or approved.</span></div></div>
      ) : null}

      <details>
        <summary>
          <span><CircleHelp size={16} /><strong>Review reasoning</strong></span>
          <span className="stage-traceability__summary-metrics">
            <Badge>{record.confidence} confidence</Badge>
            <span>{record.researchGaps.length} gaps</span>
            <span>{record.alternatives.length} alternatives</span>
            <span>{record.dependencies.length} links</span>
            <ChevronRight size={15} />
          </span>
        </summary>

        <div className="stage-traceability__body">
          {hasUnsavedClaimChanges ? <p className="stage-traceability__notice"><AlertTriangle size={14} />Save the claim text before changing its review state. Approval always applies to the last saved version.</p> : null}
          {error ? <p className="stage-traceability__error" role="alert"><AlertTriangle size={14} />{error}</p> : null}

          <section className="stage-review-state">
            <div className="stage-review-state__heading">
              <div><p className="drawer-section-label">Review state</p><strong>{record.status}</strong><span>{statusExplanation(record.status)}</span></div>
              {record.approvedAt ? <small><ShieldCheck size={13} />Approved {formatDate(record.approvedAt)}</small> : null}
            </div>
            <ul className="stage-approval-checks">
              {approvalChecks.map((check) => <li key={check.key} className={check.passed ? "passed" : ""}>{check.passed ? <Check size={13} /> : <span />}{check.label}</li>)}
            </ul>
            <label className="stage-approval-note"><span>Approval note <small>{record.status === "approved" ? "Recorded with this approval" : "Optional"}</small></span><input value={approvalNote} disabled={record.status === "approved"} maxLength={2000} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Why are you comfortable relying on this claim?" /></label>
            <div className="stage-review-state__actions">
              <Button size="sm" disabled={pending !== "" || hasUnsavedClaimChanges || record.status === "draft"} onClick={() => void changeStatus("draft")}>Return to draft</Button>
              <Button size="sm" disabled={pending !== "" || hasUnsavedClaimChanges || record.status === "ready"} onClick={() => void changeStatus("ready")}>Mark ready</Button>
              <Button size="sm" variant="dark" disabled={pending !== "" || !approvalReady || record.status === "approved"} onClick={() => void changeStatus("approved")}>{pending === "status" ? <LoaderCircle className="spin" size={13} /> : <ShieldCheck size={13} />}Approve claim</Button>
            </div>
            {!approvalReady && record.status !== "approved" ? <p className="stage-review-state__help">Approval unlocks after the required evidence and earlier-stage connections are present.</p> : null}
          </section>

          <section className="stage-uncertainty-editor">
            <div><p className="drawer-section-label">Uncertainty</p><span>State how dependable the claim feels and what evidence would change your mind.</span></div>
            <div className="stage-uncertainty-editor__fields">
              <label><span>Confidence</span><select value={confidence} onChange={(event) => setConfidence(event.target.value as StrategyConfidence)}><option value="low">Low — early or weak support</option><option value="medium">Medium — plausible, still incomplete</option><option value="high">High — strong, varied support</option></select></label>
              <label><span>Research gaps <small>One per line</small></span><textarea rows={3} maxLength={4000} value={gaps} onChange={(event) => setGaps(event.target.value)} placeholder="What do you still need to verify?" /></label>
            </div>
            <Button size="sm" disabled={!uncertaintyDirty || pending !== ""} onClick={() => void run("uncertainty", () => onSaveUncertainty(confidence, cleanResearchGaps(gaps)))}>{pending === "uncertainty" ? <LoaderCircle className="spin" size={13} /> : <Save size={13} />}Save uncertainty</Button>
            {record.status === "approved" && uncertaintyDirty ? <p className="stage-review-state__help">Saving a material change will safely return this approved claim to draft.</p> : null}
          </section>

          <section className="stage-dependencies">
            <header><div><p className="drawer-section-label">Stage dependencies</p><span>Make the path of reasoning explicit: which earlier claim does this one build from, qualify, or challenge?</span></div>{earlierStages.length ? <Button size="sm" onClick={() => setDependencyOpen((current) => !current)}><Plus size={13} />Add connection</Button> : null}</header>
            {!earlierStages.length ? <p className="stage-traceability__empty">Observation is the first stage, so it has no earlier claim dependency.</p> : null}
            {dependencyOpen ? <DependencyComposer stages={earlierStages} pending={pending === "dependency"} onCancel={() => setDependencyOpen(false)} onSave={(input) => run("dependency", async () => { await onAddDependency(input); setDependencyOpen(false); })} /> : null}
            {record.dependencies.length ? <ul>{record.dependencies.map((dependency) => {
              const upstream = stages.find((stage) => stage.id === dependency.dependsOnStageId);
              const requiredOpportunityLink = record.kind === "strategic_proposition" && upstream?.kind === "opportunity";
              return <li key={dependency.id}><GitBranch size={14} /><span><Badge>{requiredOpportunityLink ? "Required link" : dependencyRelationshipLabel(dependency.relationship)}</Badge><strong>{upstream ? stageDefinition(upstream.kind).label : "Earlier claim"}</strong>{dependency.rationale ? <small>{dependency.rationale}</small> : null}</span>{requiredOpportunityLink ? <span className="stage-dependency-required" title="The Strategic Proposition must remain connected to its Opportunity"><LockKeyhole size={13} /></span> : <button type="button" disabled={pending !== ""} onClick={() => void run("dependency", () => onRemoveDependency(dependency.id))} aria-label="Remove stage dependency"><Trash2 size={14} /></button>}</li>;
            })}</ul> : earlierStages.length && !dependencyOpen ? <p className="stage-traceability__empty">No earlier claim is connected yet.</p> : null}
          </section>

          {upstreamTrail.length ? <section className="stage-evidence-trail"><header><div><p className="drawer-section-label">Inherited evidence trail</p><span>This claim remains traceable through its saved dependencies; evidence is referenced, never copied or rewritten.</span></div><Badge>{upstreamSourceCount} original {upstreamSourceCount === 1 ? "source" : "sources"}</Badge></header><ol>{upstreamTrail.map((stage) => <li key={stage.id}><Network size={13} /><span><strong>{stageDefinition(stage.kind).label}</strong><small>{stage.content}</small></span><span><Badge>{stage.status}</Badge><small>{stage.confidence} confidence · {stage.sources.length} direct {stage.sources.length === 1 ? "source" : "sources"}</small></span></li>)}</ol></section> : null}

          <section className="stage-alternatives">
            <header><div><p className="drawer-section-label">Alternative interpretations</p><span>Keep credible competing explanations visible instead of forcing one answer too early.</span></div><Button size="sm" onClick={() => setAlternativeOpen((current) => !current)}><Plus size={13} />Add alternative</Button></header>
            {alternativeOpen ? <AlternativeComposer record={record} pending={pending === "alternative"} onCancel={() => setAlternativeOpen(false)} onSave={(input) => run("alternative", async () => { await onCreateAlternative(input); setAlternativeOpen(false); })} /> : null}
            {record.alternatives.length ? <div className="stage-alternatives__list">{record.alternatives.map((alternative) => <AlternativeEditor key={alternative.id} alternative={alternative} pending={pending === "alternative"} onSave={(input) => run("alternative", () => onUpdateAlternative(input))} />)}</div> : !alternativeOpen ? <p className="stage-traceability__empty">No competing interpretation has been recorded.</p> : null}
          </section>

          <section className="stage-revisions">
            <header><div><p className="drawer-section-label">Revision history</p><span>Saved corrections and review-state changes are append-only and cannot be rewritten.</span></div><Badge>{record.revisions.length}</Badge></header>
            {record.revisions.length ? <ol>{record.revisions.map((revision) => <li key={revision.id}><History size={13} /><div><strong>{revision.entityType === "alternative" ? "Alternative" : "Claim"} · {revision.changeKind.replaceAll("_", " ")}</strong><span>{revision.changedFields.filter((field) => field !== "updated_at").map((field) => field.replaceAll("_", " ")).join(", ")}</span><time>{formatDate(revision.createdAt)}</time><details><summary>Compare saved versions</summary><div><p><b>Before</b>{stateText(revision.beforeState)}</p><p><b>After</b>{stateText(revision.afterState)}</p></div></details></div></li>)}</ol> : <p className="stage-traceability__empty">History begins after the first saved claim is changed.</p>}
          </section>
        </div>
      </details>
    </section>
  );
}

function DependencyComposer({ stages, pending, onCancel, onSave }: { stages: StrategyStageRecord[]; pending: boolean; onCancel: () => void; onSave: (input: Pick<CreateStrategyDependencyInput, "dependsOnStageId" | "relationship" | "rationale">) => Promise<void> }) {
  const [stageId, setStageId] = useState(stages.at(-1)?.id ?? stages[0]?.id ?? "");
  const [relationship, setRelationship] = useState<StrategyDependencyRelationship>("derives_from");
  const [rationale, setRationale] = useState("");
  return <div className="stage-inline-composer"><label><span>Earlier claim</span><select value={stageId} onChange={(event) => setStageId(event.target.value)}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stageDefinition(stage.kind).label}: {stage.content.slice(0, 70)}</option>)}</select></label><label><span>Relationship</span><select value={relationship} onChange={(event) => setRelationship(event.target.value as StrategyDependencyRelationship)}><option value="derives_from">Builds from</option><option value="qualifies">Qualifies</option><option value="challenges">Challenges</option></select></label><label className="wide"><span>Why this connection exists <small>Optional</small></span><input value={rationale} maxLength={2000} onChange={(event) => setRationale(event.target.value)} placeholder="Explain the reasoning step" /></label><div><Button size="sm" disabled={pending} onClick={onCancel}>Cancel</Button><Button size="sm" variant="dark" disabled={pending || !stageId} onClick={() => void onSave({ dependsOnStageId: stageId, relationship, rationale })}>{pending ? <LoaderCircle className="spin" size={13} /> : <GitBranch size={13} />}Connect</Button></div></div>;
}

function AlternativeComposer({ record, pending, onCancel, onSave }: { record: StrategyStageRecord; pending: boolean; onCancel: () => void; onSave: (input: Omit<CreateStrategyAlternativeInput, "projectId" | "stageId">) => Promise<void> }) {
  const [content, setContent] = useState("");
  const [confidence, setConfidence] = useState<StrategyConfidence>("low");
  const [rationale, setRationale] = useState("");
  const [gaps, setGaps] = useState("");
  return <div className="stage-alternative-composer"><label><span>Competing interpretation</span><textarea rows={3} maxLength={10_000} value={content} onChange={(event) => setContent(event.target.value)} placeholder="What else could explain the same evidence?" /></label><div><label><span>Confidence</span><select value={confidence} onChange={(event) => setConfidence(event.target.value as StrategyConfidence)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label><span>Why keep it in view? <small>Optional</small></span><input value={rationale} maxLength={2000} onChange={(event) => setRationale(event.target.value)} placeholder="What would make this plausible?" /></label></div><label><span>Research gaps <small>One per line</small></span><textarea rows={2} value={gaps} onChange={(event) => setGaps(event.target.value)} placeholder="What would distinguish this interpretation?" /></label><footer><Button size="sm" disabled={pending} onClick={onCancel}>Cancel</Button><Button size="sm" variant="dark" disabled={pending || !content.trim()} onClick={() => void onSave({ content, claimType: record.claimType, confidence, rationale, researchGaps: cleanResearchGaps(gaps) })}>{pending ? <LoaderCircle className="spin" size={13} /> : <Plus size={13} />}Record alternative</Button></footer></div>;
}

function AlternativeEditor({ alternative, pending, onSave }: { alternative: StrategyStageAlternativeRecord; pending: boolean; onSave: (input: Omit<UpdateStrategyAlternativeInput, "projectId" | "stageId">) => Promise<void> }) {
  const [content, setContent] = useState(alternative.content);
  const [confidence, setConfidence] = useState(alternative.confidence);
  const [status, setStatus] = useState<StrategyAlternativeStatus>(alternative.status);
  const [rationale, setRationale] = useState(alternative.rationale ?? "");
  const [gaps, setGaps] = useState(alternative.researchGaps.join("\n"));
  const dirty = content.trim() !== alternative.content.trim() || confidence !== alternative.confidence || status !== alternative.status || rationale.trim() !== (alternative.rationale ?? "").trim() || gaps.trim() !== alternative.researchGaps.join("\n").trim();
  return <details className="stage-alternative-item"><summary><span><Badge>{status}</Badge><strong>{content}</strong></span><span>{confidence} confidence<ChevronRight size={14} /></span></summary><div><label><span>Interpretation</span><textarea rows={3} maxLength={10_000} value={content} onChange={(event) => setContent(event.target.value)} /></label><div><label><span>Confidence</span><select value={confidence} onChange={(event) => setConfidence(event.target.value as StrategyConfidence)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label><span>Decision</span><select value={status} onChange={(event) => setStatus(event.target.value as StrategyAlternativeStatus)}><option value="considering">Still considering</option><option value="retained">Retain alongside main claim</option><option value="rejected">Rejected after review</option></select></label></div><label><span>Rationale <small>Optional</small></span><input value={rationale} maxLength={2000} onChange={(event) => setRationale(event.target.value)} /></label><label><span>Research gaps <small>One per line</small></span><textarea rows={2} value={gaps} onChange={(event) => setGaps(event.target.value)} /></label><Button size="sm" disabled={pending || !dirty || !content.trim()} onClick={() => void onSave({ id: alternative.id, content, claimType: alternative.claimType, confidence, rationale, researchGaps: cleanResearchGaps(gaps), status })}>{pending ? <LoaderCircle className="spin" size={13} /> : <Save size={13} />}Save alternative</Button><p>Alternatives are retained for traceability. Mark one rejected instead of deleting the reasoning history.</p></div></details>;
}
