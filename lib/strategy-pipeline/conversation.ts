import type { StrategySessionDetail } from "./types";

const MAX_HANDOFF_QUESTION_LENGTH = 1_000;

export function strategySessionHandoffQuestion(session: StrategySessionDetail) {
  const strategistTurns = session.turns
    .filter((turn) => turn.role === "user" && turn.origin === "strategist")
    .slice(-4)
    .map((turn) => turn.content.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const conversation = strategistTurns.length ? strategistTurns : [session.title];
  const prefix = "Help me think through this unfinished strategy conversation. What does the available evidence support, what tensions or alternative interpretations may be present, and what should I investigate next?\n\nCurrent thinking:\n";
  const bullets = conversation.map((turn) => `- ${turn}`).join("\n");
  const available = Math.max(MAX_HANDOFF_QUESTION_LENGTH - prefix.length, 0);
  return `${prefix}${bullets.slice(0, available)}`.trim();
}

export const strategyPieceLabels = {
  observation: "Observation",
  question: "Question to explore",
  interpretation: "Possible meaning",
  tension: "Tension",
  hypothesis: "Hypothesis",
  opportunity: "Opportunity",
} as const;
