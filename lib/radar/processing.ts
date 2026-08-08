import type { DateRangeKey, RadarAnalytics, RadarMention, SentimentPoint, SourceBreakdown, SpikeInsight, StrategistObservation, TopicIntelligence, VolumePoint } from "./types";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN_TOPIC_SAMPLE_FOR_SENTIMENT_CLAIM = 3;
const MIN_NEGATIVE_MENTIONS_FOR_CONCENTRATION = 2;
const MIN_TOPIC_NEGATIVE_RATE = 0.25;
const MIN_NEGATIVE_RATE_UPLIFT = 0.1;
const sourceLabels: Record<string, string> = {
  reddit: "Reddit",
  youtube: "YouTube",
  rss: "RSS",
  news: "News",
  manual: "Manual",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
};

const positiveWords = ["love", "great", "good", "welcoming", "helpful", "comfortable", "beautiful", "excited", "easy", "community", "fresh", "better", "favourite"];
const negativeWords = ["expensive", "overpriced", "pressure", "intimidating", "frustrating", "disappointed", "worse", "exclusive", "confusing", "hard", "issue", "problem"];
const stopWords = new Set(["about", "after", "again", "also", "and", "are", "because", "been", "but", "can", "for", "from", "have", "into", "its", "just", "more", "that", "the", "their", "they", "this", "with", "you", "your"]);

export function normalizeEngagement(metrics: { likes?: number; comments?: number; shares?: number; views?: number }) {
  return Math.round((metrics.likes ?? 0) + (metrics.comments ?? 0) * 2 + (metrics.shares ?? 0) * 3 + (metrics.views ?? 0) * 0.015);
}

export function analyzeSentiment(content: string) {
  const normalized = content.toLowerCase();
  const positive = positiveWords.filter((word) => normalized.includes(word)).length;
  const negative = negativeWords.filter((word) => normalized.includes(word)).length;
  const raw = positive - negative;
  return { label: raw > 0 ? "positive" as const : raw < 0 ? "negative" as const : "neutral" as const, score: Math.max(-1, Math.min(1, raw / 3)) };
}

export function extractKeywords(content: string, limit = 8) {
  const counts = new Map<string, number>();
  for (const token of content.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []) {
    if (stopWords.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([keyword]) => keyword);
}

const topicRules: { name: string; terms: string[] }[] = [
  { name: "Running Clubs", terms: ["run club", "running club", "pace group", "crew", "social run"] },
  { name: "Community", terms: ["community", "meetup", "together", "group chat", "belonging"] },
  { name: "Pricing", terms: ["price", "pricing", "expensive", "cost", "overpriced"] },
  { name: "Product Experience", terms: ["design", "quality", "comfort", "feature", "product", "experience"] },
  { name: "Campaigns", terms: ["campaign", "advert", "launch", "activation", "collaboration"] },
  { name: "Service Issues", terms: ["issue", "problem", "support", "broken", "frustrating", "error"] },
];

export function assignTopics(content: string) {
  const normalized = content.toLowerCase();
  const matches = topicRules.filter((rule) => rule.terms.some((term) => normalized.includes(term))).map((rule) => rule.name);
  return matches.length ? matches : ["General Conversation"];
}

export function calculateGrowth(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function getDateBounds(range: DateRangeKey, now: Date, custom?: { start?: string; end?: string }) {
  let start: Date;
  let end = new Date(now);
  if (range === "custom" && custom?.start && custom?.end) {
    start = new Date(`${custom.start}T00:00:00.000Z`);
    end = new Date(`${custom.end}T23:59:59.999Z`);
  } else {
    const duration = range === "24h" ? DAY : range === "7d" ? 7 * DAY : range === "90d" ? 90 * DAY : 30 * DAY;
    start = new Date(end.getTime() - duration);
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    end = new Date(now);
    start = new Date(end.getTime() - 30 * DAY);
  }
  const duration = end.getTime() - start.getTime();
  return { start, end, previousStart: new Date(start.getTime() - duration), previousEnd: new Date(start.getTime() - 1) };
}

function dateLabel(date: Date, range: DateRangeKey) {
  if (range === "24h") return date.toLocaleTimeString("en-SG", { hour: "numeric", hour12: true, timeZone: "UTC" });
  return date.toLocaleDateString("en-SG", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function intervalFor(range: DateRangeKey, start: Date, end: Date) {
  if (range === "24h") return 3 * HOUR;
  if (range === "7d") return DAY;
  if (range === "90d") return 7 * DAY;
  if (range === "custom") {
    const days = (end.getTime() - start.getTime()) / DAY;
    return days <= 2 ? 6 * HOUR : days <= 45 ? DAY : 7 * DAY;
  }
  return DAY;
}

function countByBin(mentions: RadarMention[], start: Date, interval: number, binCount: number) {
  const values = Array.from({ length: binCount }, () => 0);
  for (const mention of mentions) {
    const index = Math.floor((new Date(mention.publishedAt).getTime() - start.getTime()) / interval);
    if (index >= 0 && index < binCount) values[index] += 1;
  }
  return values;
}

function buildVolume(current: RadarMention[], previous: RadarMention[], range: DateRangeKey, start: Date, end: Date, previousStart: Date) {
  const interval = intervalFor(range, start, end);
  const binCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / interval));
  const currentCounts = countByBin(current, start, interval, binCount);
  const previousCounts = countByBin(previous, previousStart, interval, binCount);
  return currentCounts.map((mentions, index): VolumePoint => {
    const recent = currentCounts.slice(Math.max(0, index - 3), index);
    const rolling = recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : previousCounts[index] ?? 0;
    const baseline = Math.max(1, Math.round(((previousCounts[index] ?? 0) + rolling) / 2));
    const timestamp = new Date(start.getTime() + index * interval).toISOString();
    return { timestamp, label: dateLabel(new Date(timestamp), range), mentions, baseline };
  });
}

function mentionsForPoint(mentions: RadarMention[], point: VolumePoint, interval: number) {
  const start = new Date(point.timestamp).getTime();
  return mentions.filter((mention) => {
    const value = new Date(mention.publishedAt).getTime();
    return value >= start && value < start + interval;
  });
}

function rankCounts(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function detectSpikes(volume: VolumePoint[], current: RadarMention[], range: DateRangeKey, start: Date, end: Date) {
  const interval = intervalFor(range, start, end);
  const candidates = volume.filter((point) => point.mentions >= 4 && calculateGrowth(point.mentions, point.baseline) >= 75);
  return candidates.map((point, index): SpikeInsight => {
    const bucket = mentionsForPoint(current, point, interval);
    const topicCounts = rankCounts(bucket.flatMap((mention) => mention.topics));
    const sourceCounts = rankCounts(bucket.map((mention) => sourceLabels[mention.platform] ?? mention.platform));
    const keywordCounts = rankCounts(bucket.flatMap((mention) => mention.keywords));
    const topTopic = topicCounts[0];
    const driverIds = topTopic ? bucket.filter((mention) => mention.topics.includes(topTopic[0])).sort((a, b) => b.engagement - a.engagement).slice(0, 3).map((mention) => mention.id) : [];
    const clearDriver = topTopic && topTopic[1] / Math.max(1, bucket.length) >= 0.35 && driverIds.length >= 2;
    return {
      id: `spike-${new Date(point.timestamp).toISOString().slice(0, 10)}-${index}`,
      timestamp: point.timestamp,
      label: new Date(point.timestamp).toLocaleDateString("en-SG", { day: "numeric", month: "long", timeZone: "UTC" }),
      mentions: point.mentions,
      baseline: point.baseline,
      growth: calculateGrowth(point.mentions, point.baseline),
      topTopics: topicCounts.slice(0, 4).map(([name, mentions]) => ({ name, mentions })),
      topSources: sourceCounts.slice(0, 4).map(([name, mentions]) => ({ name, mentions })),
      unusualKeywords: keywordCounts.slice(0, 6).map(([keyword]) => keyword),
      topMentionIds: [...bucket].sort((a, b) => b.engagement - a.engagement).slice(0, 4).map((mention) => mention.id),
      likelyDrivers: clearDriver ? [{ explanation: `${topTopic[0]} accounted for ${Math.round((topTopic[1] / bucket.length) * 100)}% of mentions in this spike.`, mentionIds: driverIds }] : [],
    };
  }).sort((a, b) => b.growth - a.growth);
}

function buildSentiment(volume: VolumePoint[], current: RadarMention[], range: DateRangeKey, start: Date, end: Date): SentimentPoint[] {
  const interval = intervalFor(range, start, end);
  return volume.map((point) => {
    const bucket = mentionsForPoint(current, point, interval);
    const total = Math.max(1, bucket.length);
    const count = (sentiment: RadarMention["sentiment"]) => Math.round((bucket.filter((mention) => mention.sentiment === sentiment).length / total) * 100);
    return { timestamp: point.timestamp, label: point.label, positive: count("positive"), neutral: count("neutral"), negative: count("negative") };
  });
}

function buildSources(current: RadarMention[]): SourceBreakdown[] {
  const total = Math.max(1, current.length);
  return rankCounts(current.map((mention) => mention.platform)).map(([source, mentions]) => ({
    source: source as RadarMention["platform"],
    label: sourceLabels[source] ?? source,
    mentions,
    share: Math.round((mentions / total) * 100),
    engagement: current.filter((mention) => mention.platform === source).reduce((sum, mention) => sum + mention.engagement, 0),
  }));
}

function buildTopics(current: RadarMention[], previous: RadarMention[]): TopicIntelligence[] {
  const currentCounts = rankCounts(current.flatMap((mention) => mention.topics));
  const previousCounts = new Map(rankCounts(previous.flatMap((mention) => mention.topics)));
  return currentCounts.map(([name, mentions]) => {
    const matching = current.filter((mention) => mention.topics.includes(name));
    const positive = matching.filter((mention) => mention.sentiment === "positive").length;
    const negative = matching.filter((mention) => mention.sentiment === "negative").length;
    const topSource = rankCounts(matching.map((mention) => sourceLabels[mention.platform] ?? mention.platform))[0]?.[0] ?? "—";
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      mentions,
      growth: calculateGrowth(mentions, previousCounts.get(name) ?? 0),
      sentiment: Math.round(((positive - negative) / Math.max(1, matching.length)) * 100),
      engagement: matching.reduce((sum, mention) => sum + mention.engagement, 0),
      uniqueAuthors: new Set(matching.map((mention) => mention.author)).size,
      topSource,
      exampleMentionIds: [...matching].sort((a, b) => b.engagement - a.engagement).slice(0, 3).map((mention) => mention.id),
    };
  });
}

function buildKeywords(current: RadarMention[], previous: RadarMention[]) {
  const currentCounts = rankCounts(current.flatMap((mention) => mention.keywords));
  const previousCounts = new Map(rankCounts(previous.flatMap((mention) => mention.keywords)));
  return currentCounts.slice(0, 14).map(([keyword, count]) => ({ keyword, count, growth: calculateGrowth(count, previousCounts.get(keyword) ?? 0) }));
}

function buildObservations(current: RadarMention[], previous: RadarMention[], topics: TopicIntelligence[], sources: SourceBreakdown[]): StrategistObservation[] {
  if (!current.length) return [];
  const observations: StrategistObservation[] = [];
  const topTopic = [...topics].sort((a, b) => b.growth - a.growth)[0];
  if (topTopic) {
    const support = current.filter((mention) => mention.topics.includes(topTopic.name)).sort((a, b) => b.engagement - a.engagement).slice(0, 4);
    observations.push({
      id: "fastest-topic",
      observation: `${topTopic.name} is the fastest-growing conversation in the selected period.` ,
      measuredEvidence: [`${topTopic.mentions} mentions`, `${topTopic.growth >= 0 ? "+" : ""}${topTopic.growth}% versus the previous period`, `${topTopic.uniqueAuthors} unique authors`],
      interpretation: `The monitor’s momentum is being shaped more by ${topTopic.name.toLowerCase()} than by the overall brand conversation.`,
      hypothesis: topTopic.name === "Running Clubs" ? "Participation and belonging may currently be more culturally salient than product performance." : undefined,
      whyItMatters: "Creative direction should respond to the subject producing momentum, not simply the total volume around the brand.",
      confidence: support.length >= 3 && topTopic.mentions >= 8 ? "High" : "Medium",
      supportingMentionIds: support.map((mention) => mention.id),
    });
  }
  const overallNegativeRate = current.filter((mention) => mention.sentiment === "negative").length / current.length;
  const negativeTopics = topics.map((topic) => {
    const items = current.filter((mention) => mention.topics.includes(topic.name));
    const negativeItems = items.filter((mention) => mention.sentiment === "negative");
    return {
      ...topic,
      items,
      negativeItems,
      negativeRate: negativeItems.length / Math.max(1, items.length),
    };
  }).filter((topic) => (
    topic.items.length >= MIN_TOPIC_SAMPLE_FOR_SENTIMENT_CLAIM
    && topic.negativeItems.length >= MIN_NEGATIVE_MENTIONS_FOR_CONCENTRATION
    && topic.negativeRate >= MIN_TOPIC_NEGATIVE_RATE
    && topic.negativeRate >= overallNegativeRate + MIN_NEGATIVE_RATE_UPLIFT
  )).sort((a, b) => b.negativeRate - a.negativeRate || b.negativeItems.length - a.negativeItems.length);
  const negativeTopic = negativeTopics[0];
  if (negativeTopic) {
    const negativeItems = [...negativeTopic.negativeItems].sort((a, b) => b.engagement - a.engagement);
    const rate = Math.round(negativeTopic.negativeRate * 100);
    observations.push({
      id: "sentiment-concentration",
      observation: `Negative sentiment is concentrated in ${negativeTopic.name.toLowerCase()}, rather than distributed evenly across the monitor.`,
      measuredEvidence: [`${rate}% of ${negativeTopic.name} mentions are negative`, `${negativeItems.length} supporting mentions`],
      interpretation: `This is a specific friction to investigate, not evidence of broad brand rejection.`,
      whyItMatters: "A targeted response may protect positive product and community conversation without amplifying a wider problem that the data does not show.",
      confidence: negativeItems.length >= 4 ? "High" : "Developing",
      supportingMentionIds: negativeItems.slice(0, 4).map((mention) => mention.id),
    });
  }
  const topSource = sources[0];
  if (topSource && topSource.share >= 45) {
    observations.push({
      id: "source-concentration",
      observation: `${topSource.label} contributes ${topSource.share}% of collected conversation in this period.`,
      measuredEvidence: [`${topSource.mentions} mentions from ${topSource.label}`, `${topSource.engagement.toLocaleString("en-SG")} estimated engagement`],
      interpretation: "The apparent conversation may reflect the norms of one source more than the market as a whole.",
      hypothesis: "Adding another connected source could materially change the topic and sentiment mix.",
      whyItMatters: "Treat source concentration as a research limitation before making audience-wide claims.",
      confidence: "High",
      supportingMentionIds: current.filter((mention) => sourceLabels[mention.platform] === topSource.label).slice(0, 4).map((mention) => mention.id),
    });
  }
  void previous;
  return observations;
}

export function buildRadarAnalytics(
  mentions: RadarMention[],
  range: DateRangeKey,
  now: Date,
  custom?: { start?: string; end?: string },
  topic?: string,
): RadarAnalytics {
  const bounds = getDateBounds(range, now, custom);
  const scoped = topic ? mentions.filter((mention) => mention.topics.includes(topic)) : mentions;
  const currentMentions = scoped.filter((mention) => {
    const value = new Date(mention.publishedAt);
    return value >= bounds.start && value <= bounds.end;
  });
  const previousMentions = scoped.filter((mention) => {
    const value = new Date(mention.publishedAt);
    return value >= bounds.previousStart && value <= bounds.previousEnd;
  });
  const total = Math.max(1, currentMentions.length);
  const percentage = (sentiment: RadarMention["sentiment"]) => Math.round((currentMentions.filter((mention) => mention.sentiment === sentiment).length / total) * 100);
  const metrics = {
    totalMentions: currentMentions.length,
    mentionGrowth: calculateGrowth(currentMentions.length, previousMentions.length),
    engagement: currentMentions.reduce((sum, mention) => sum + mention.engagement, 0),
    positive: currentMentions.length ? percentage("positive") : 0,
    neutral: currentMentions.length ? percentage("neutral") : 0,
    negative: currentMentions.length ? percentage("negative") : 0,
    uniqueAuthors: new Set(currentMentions.map((mention) => mention.author)).size,
    activeSources: new Set(currentMentions.map((mention) => mention.platform)).size,
  };
  const volume = buildVolume(currentMentions, previousMentions, range, bounds.start, bounds.end, bounds.previousStart);
  const sources = buildSources(currentMentions);
  const topics = buildTopics(currentMentions, previousMentions);
  const sentiment = buildSentiment(volume, currentMentions, range, bounds.start, bounds.end);
  const spikes = detectSpikes(volume, currentMentions, range, bounds.start, bounds.end);
  spikes.forEach((spike) => {
    const point = volume.find((item) => item.timestamp === spike.timestamp);
    if (point) point.spikeId = spike.id;
  });
  return {
    bounds,
    currentMentions,
    previousMentions,
    metrics,
    volume,
    sentiment,
    sources,
    topics,
    keywords: buildKeywords(currentMentions, previousMentions),
    spikes,
    observations: buildObservations(currentMentions, previousMentions, topics, sources),
  };
}
