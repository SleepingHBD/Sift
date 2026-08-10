import type { StrategyHandoffTask } from "./handoff";

export interface StrategyQuestionTemplate {
  id: string;
  label: string;
  task: StrategyHandoffTask;
  question: string;
}

export const STRATEGY_QUESTION_TEMPLATES: StrategyQuestionTemplate[] = [
  {
    id: "understand-change",
    label: "Understand what is changing",
    task: "analyse",
    question: "What does the available evidence suggest about [subject or behaviour], what appears to be changing, and how confident can we be?",
  },
  {
    id: "audience-motivation",
    label: "Understand an audience motivation",
    task: "analyse",
    question: "What does the available evidence suggest about why [audience] behaves or feels this way, and what remains uncertain?",
  },
  {
    id: "find-tension",
    label: "Find a consumer or cultural tension",
    task: "tensions",
    question: "What tension exists between [what people want] and [what prevents or frustrates them], and which evidence supports or challenges it?",
  },
  {
    id: "develop-insight",
    label: "Develop a human insight",
    task: "insights",
    question: "What human truth could explain [observed behaviour], why might it matter to [audience or brand], and what evidence supports it?",
  },
  {
    id: "find-opportunity",
    label: "Find a strategic opportunity",
    task: "opportunities",
    question: "What credible opportunity does [pattern or tension] create for [brand], and what evidence or risks should shape the response?",
  },
  {
    id: "test-hypothesis",
    label: "Test a hypothesis",
    task: "analyse",
    question: "Does the available evidence support the hypothesis that [write your hypothesis]? Separate supported facts, interpretation, contradictions, and evidence gaps.",
  },
  {
    id: "creative-direction",
    label: "Explore creative directions",
    task: "opportunities",
    question: "What meaningfully different creative directions could emerge from [insight or tension], what role could [brand] credibly play, and what still needs validation?",
  },
];
