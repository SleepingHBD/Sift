import type { NormalizedMention } from "./types.ts";

const positiveWords = ["love", "great", "good", "welcoming", "helpful", "comfortable", "beautiful", "excited", "easy", "community", "fresh", "better", "favourite"];
const negativeWords = ["expensive", "overpriced", "pressure", "intimidating", "frustrating", "disappointed", "worse", "exclusive", "confusing", "hard", "issue", "problem"];
const stopWords = new Set(["about", "after", "again", "also", "and", "are", "because", "been", "but", "can", "for", "from", "have", "into", "its", "just", "more", "that", "the", "their", "they", "this", "with", "you", "your"]);

const topicRules = [
  { name: "Community", terms: ["community", "club", "group", "together", "meetup"] },
  { name: "Pricing", terms: ["price", "pricing", "expensive", "cost", "overpriced", "value"] },
  { name: "Product Experience", terms: ["design", "quality", "comfort", "feature", "product", "experience"] },
  { name: "Campaigns", terms: ["campaign", "advert", "launch", "activation", "collaboration"] },
  { name: "Service Issues", terms: ["issue", "problem", "support", "broken", "frustrating", "error"] },
];

export function processMention(mention: NormalizedMention) {
  const sentiment = analyzeSentiment(mention.content);
  return { mention, sentiment, keywords: extractKeywords(mention.content), topics: assignTopics(mention.content) };
}

export function analyzeSentiment(content: string) {
  const normalized = content.toLowerCase();
  const positive = positiveWords.filter((word) => normalized.includes(word)).length;
  const negative = negativeWords.filter((word) => normalized.includes(word)).length;
  const raw = positive - negative;
  return { label: raw > 0 ? "positive" : raw < 0 ? "negative" : "neutral", score: Math.max(-1, Math.min(1, raw / 3)) };
}

export function extractKeywords(content: string, limit = 8) {
  const counts = new Map<string, number>();
  for (const token of content.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []) {
    if (stopWords.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([keyword]) => keyword);
}

export function assignTopics(content: string) {
  const normalized = content.toLowerCase();
  const matches = topicRules.filter((rule) => rule.terms.some((term) => normalized.includes(term))).map((rule) => rule.name);
  return matches.length ? matches : ["General Conversation"];
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
