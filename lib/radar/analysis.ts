import { sourceFromDatabase } from "./model.ts";
import { radarDateLabel } from "./processing.ts";
import type {
  DateRangeKey,
  RadarMonitorAnalysis,
  RadarSource,
  SentimentPoint,
  SpikeInsight,
  TopicIntelligence,
  VolumePoint,
} from "./types.ts";

export interface RadarMonitorAnalysisRow {
  volume: unknown;
  sentiment: unknown;
  topics: unknown;
  keywords: unknown;
  spikes: unknown;
}

const sourceLabels: Record<RadarSource, string> = {
  reddit: "Reddit",
  youtube: "YouTube",
  rss: "RSS & Atom",
  news: "News",
  manual: "Manual URL",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function timestamp(value: unknown) {
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function sourceLabel(value: unknown) {
  const rawSource = text(value);
  if (!rawSource) return "—";
  const source = sourceFromDatabase(rawSource);
  return sourceLabels[source];
}

function mentionId(value: unknown, monitorClientId: string) {
  const identity = record(value);
  const externalId = text(identity.externalId);
  if (!externalId) return "";
  return `${monitorClientId}:${sourceFromDatabase(text(identity.platform))}:${externalId}`;
}

function mentionIds(value: unknown, monitorClientId: string) {
  return array(value).map((item) => mentionId(item, monitorClientId)).filter(Boolean);
}

function mentionCloudIds(value: unknown) {
  return array(value).map((item) => text(record(item).cloudId)).filter(Boolean);
}

function volumePoints(value: unknown, range: DateRangeKey): VolumePoint[] {
  return array(value).map((item) => {
    const point = record(item);
    const observedAt = timestamp(point.timestamp);
    const spikeId = text(point.spikeId);
    return {
      timestamp: observedAt,
      label: radarDateLabel(new Date(observedAt), range),
      mentions: number(point.mentions),
      baseline: number(point.baseline),
      spikeId: spikeId || undefined,
    };
  });
}

function sentimentPoints(value: unknown, range: DateRangeKey): SentimentPoint[] {
  return array(value).map((item) => {
    const point = record(item);
    const observedAt = timestamp(point.timestamp);
    return {
      timestamp: observedAt,
      label: radarDateLabel(new Date(observedAt), range),
      positive: number(point.positive),
      neutral: number(point.neutral),
      negative: number(point.negative),
    };
  });
}

function topics(value: unknown, monitorClientId: string): TopicIntelligence[] {
  return array(value).flatMap((item) => {
    const topic = record(item);
    const name = text(topic.name);
    if (!name) return [];
    return [{
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      mentions: number(topic.mentions),
      growth: number(topic.growth),
      sentiment: number(topic.sentiment),
      engagement: number(topic.engagement),
      uniqueAuthors: number(topic.uniqueAuthors),
      topSource: sourceLabel(topic.topSource),
      exampleMentionIds: mentionIds(topic.exampleMentions, monitorClientId),
      exampleMentionCloudIds: mentionCloudIds(topic.exampleMentions),
    }];
  });
}

function keywords(value: unknown) {
  return array(value).flatMap((item) => {
    const keyword = record(item);
    const name = text(keyword.keyword);
    return name ? [{ keyword: name, count: number(keyword.count), growth: number(keyword.growth) }] : [];
  });
}

function namedCounts(value: unknown, mapSource = false) {
  return array(value).flatMap((item) => {
    const count = record(item);
    const rawName = text(count.name);
    if (!rawName) return [];
    return [{ name: mapSource ? sourceLabel(rawName) : rawName, mentions: number(count.mentions) }];
  });
}

function spikes(value: unknown, monitorClientId: string): SpikeInsight[] {
  return array(value).flatMap((item) => {
    const spike = record(item);
    const observedAt = timestamp(spike.timestamp);
    const id = text(spike.id);
    if (!id) return [];
    return [{
      id,
      timestamp: observedAt,
      label: new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(observedAt)),
      mentions: number(spike.mentions),
      baseline: number(spike.baseline),
      growth: number(spike.growth),
      topTopics: namedCounts(spike.topTopics),
      topSources: namedCounts(spike.topSources, true),
      unusualKeywords: array(spike.unusualKeywords).map(text).filter(Boolean),
      topMentionIds: mentionIds(spike.topMentions, monitorClientId),
      topMentionCloudIds: mentionCloudIds(spike.topMentions),
      likelyDrivers: array(spike.likelyDrivers).flatMap((item) => {
        const driver = record(item);
        const explanation = text(driver.explanation);
        return explanation ? [{ explanation, mentionIds: mentionIds(driver.mentionIds, monitorClientId), mentionCloudIds: mentionCloudIds(driver.mentionIds) }] : [];
      }),
    }];
  });
}

export function radarMonitorAnalysisFromRow(
  row: RadarMonitorAnalysisRow,
  monitorClientId: string,
  range: DateRangeKey,
): RadarMonitorAnalysis {
  return {
    volume: volumePoints(row.volume, range),
    sentiment: sentimentPoints(row.sentiment, range),
    topics: topics(row.topics, monitorClientId),
    keywords: keywords(row.keywords),
    spikes: spikes(row.spikes, monitorClientId),
  };
}
