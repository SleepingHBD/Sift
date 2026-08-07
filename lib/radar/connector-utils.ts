import type { NormalizedMention } from "../connectors/types.ts";
import { analyzeSentiment, assignTopics, extractKeywords } from "./processing.ts";
import type { MonitoringQuery, RadarMention, RadarSource } from "./types.ts";

export interface RadarConnectorSettings {
  rssFeedUrls: string[];
  manualUrls: string[];
  youtubeEnabled: boolean;
}

export const defaultRadarConnectorSettings: RadarConnectorSettings = {
  rssFeedUrls: [],
  manualUrls: [],
  youtubeEnabled: false,
};

export function getRunnableSources(monitor: MonitoringQuery, settings: RadarConnectorSettings): RadarSource[] {
  const configured: RadarSource[] = [];
  if (settings.rssFeedUrls.length) configured.push("rss");
  if (settings.manualUrls.length) configured.push("manual");
  if (settings.youtubeEnabled) configured.push("youtube");
  if (!monitor.sources.length) return configured;
  return configured.filter((source) => monitor.sources.includes(source));
}

export function enrichConnectorMentions(mentions: NormalizedMention[], monitor: MonitoringQuery): RadarMention[] {
  return mentions.map((mention) => {
    const sentiment = analyzeSentiment(mention.content);
    const keywords = extractKeywords(mention.content);
    return {
      id: `${monitor.id}:${mention.platform}:${mention.externalId}`,
      monitorId: monitor.id,
      platform: mention.platform,
      sourceLabel: typeof mention.metadata.sourceLabel === "string" ? mention.metadata.sourceLabel : sourceLabel(mention.platform),
      externalId: mention.externalId,
      author: mention.author || "Unknown author",
      authorHandle: typeof mention.metadata.authorHandle === "string" ? mention.metadata.authorHandle : undefined,
      content: mention.content,
      url: mention.url,
      publishedAt: mention.publishedAt,
      likes: mention.likes,
      comments: mention.comments,
      shares: mention.shares,
      views: mention.views,
      engagement: mention.engagement,
      language: mention.language || "unknown",
      market: monitor.market || undefined,
      sentiment: sentiment.label,
      sentimentScore: sentiment.score,
      topics: assignTopics(mention.content),
      keywords,
      relevance: calculateRelevance(mention.content, monitor),
      metadata: mention.metadata,
    };
  });
}

export function mergeRadarMentions(existing: RadarMention[], incoming: RadarMention[]) {
  const merged = new Map(existing.map((mention) => [`${mention.platform}:${mention.externalId}`, mention]));
  incoming.forEach((mention) => merged.set(`${mention.platform}:${mention.externalId}`, mention));
  return [...merged.values()].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

function calculateRelevance(content: string, monitor: MonitoringQuery) {
  const normalized = content.toLowerCase();
  const included = [...monitor.builder.includeAll, ...monitor.builder.includeAny].filter(Boolean);
  if (!included.length) return 70;
  const matches = included.filter((term) => normalized.includes(term.toLowerCase())).length;
  return Math.max(25, Math.min(100, Math.round((matches / included.length) * 100)));
}

function sourceLabel(source: RadarSource) {
  return source === "rss" ? "RSS feed" : source === "manual" ? "Imported URL" : source === "youtube" ? "YouTube" : source;
}
