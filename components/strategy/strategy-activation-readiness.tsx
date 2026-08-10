import { CheckCircle2, CircleDashed, FlaskConical, ShieldCheck, WalletCards, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { STRATEGY_EVALUATION_CASES } from "@/lib/strategy-ai/evaluation";
import type { StrategyEvidencePreview } from "@/lib/strategy-ai/types";

export function StrategyActivationReadiness({ preview }: { preview: StrategyEvidencePreview | null }) {
  const budget = preview?.analysis.budget;
  const modelConfigured = preview?.analysis.modelConfigured;
  return (
    <section className="strategy-readiness" aria-labelledby="strategy-readiness-heading">
      <div className="strategy-readiness__head">
        <div><p className="eyebrow">Activation checkpoint</p><h2 id="strategy-readiness-heading">Prove the guardrails before paying for answers.</h2></div>
        <Badge>Phase 6</Badge>
      </div>
      <div className="strategy-readiness__list">
        <ReadinessRow icon={ShieldCheck} label="Evidence and citation boundary" detail="Unknown sources and uncited claims are rejected before storage." state="Ready" ready />
        <ReadinessRow icon={FlaskConical} label="Evaluation suite" detail={`${STRATEGY_EVALUATION_CASES.length} task-specific scenarios are ready; live results still need human review.`} state="Ready to run" ready />
        <ReadinessRow
          icon={WalletCards}
          label="Monthly usage guardrails"
          detail={budget?.configured
            ? `${budget.remainingRequests} of ${budget.monthlyRequestLimit} requests and ${formatTokens(budget.remainingTokens)} tokens remain in this monthly allowance.`
            : preview ? budget?.reason || "Server-side request and token limits need configuration." : "Sift will verify the server-side request and token limits with the first evidence search."}
          state={budget?.configured ? budget.available ? "Protected" : "Limit reached" : preview ? "Needs setup" : "Not checked"}
          ready={Boolean(budget?.configured && budget.available)}
        />
        <ReadinessRow
          icon={CircleDashed}
          label="Model connection"
          detail={modelConfigured ? "A server-side model and API key are configured; neither is exposed to the browser." : preview ? "No OpenAI model or API key is connected yet." : "Sift will check the private model configuration with the first evidence search."}
          state={modelConfigured ? "Connected" : preview ? "Not connected" : "Not checked"}
          ready={Boolean(modelConfigured)}
        />
      </div>
      <p className="strategy-readiness__foot">No live evaluation has run yet. Passing the automated contract is necessary, but evidence fit, caveat quality, strategic usefulness, and cost still require a short human review.</p>
    </section>
  );
}

function ReadinessRow({
  icon: Icon,
  label,
  detail,
  state,
  ready,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  state: string;
  ready: boolean;
}) {
  return (
    <div className={`strategy-readiness__row ${ready ? "strategy-readiness__row--ready" : ""}`}>
      <span className="strategy-readiness__icon"><Icon size={16} /></span>
      <div><strong>{label}</strong><span>{detail}</span></div>
      <span className="strategy-readiness__state">{ready ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}{state}</span>
    </div>
  );
}

function formatTokens(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
