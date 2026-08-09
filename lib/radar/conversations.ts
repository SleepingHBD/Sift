import { radarMentionFromRow, type MentionRow } from "./model.ts";
import type { MonitoringQuery, RadarMention } from "./types.ts";

export interface RadarConversationRpcRow {
  conversation: unknown;
  cursor_value?: unknown;
  total_count?: number | string | null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function reviewStatus(value: unknown): MentionRow["review_status"] {
  return value === "relevant" || value === "irrelevant" || value === "archived" ? value : "unreviewed";
}

function sentiment(value: unknown): MentionRow["sentiment"] {
  return value === "positive" || value === "neutral" || value === "negative" ? value : "unknown";
}

export function radarMentionFromConversation(value: unknown, monitor: MonitoringQuery): RadarMention {
  const row = object(value);
  const sourceName = text(row.source_name, "Collected source");
  const topicNames = stringArray(row.topic_names);
  const mapped = radarMentionFromRow({
    id: text(row.id),
    project_id: text(row.project_id),
    monitoring_query_id: nullableText(row.monitoring_query_id),
    platform: text(row.platform, "manual_url"),
    external_id: nullableText(row.external_id),
    author: nullableText(row.author),
    content: text(row.content),
    url: nullableText(row.url),
    published_at: nullableText(row.published_at),
    likes: number(row.likes),
    comments: number(row.comments),
    shares: number(row.shares),
    views: number(row.views),
    engagement: number(row.engagement),
    language: nullableText(row.language),
    sentiment: sentiment(row.sentiment),
    sentiment_score: row.sentiment_score == null ? null : number(row.sentiment_score),
    keywords: stringArray(row.keywords),
    metadata: object(row.metadata),
    is_important: row.is_important === true,
    review_status: reviewStatus(row.review_status),
    reviewed_at: nullableText(row.reviewed_at),
    created_at: text(row.created_at),
    sources: { name: sourceName },
    mention_topics: topicNames.map((name) => ({ topics: { name } })),
  }, monitor);
  const relevance = number(row.relevance);
  return relevance ? { ...mapped, relevance } : mapped;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeRadarConversationCursor(value: unknown) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export function decodeRadarConversationCursor(value: string) {
  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
    const cursor = object(decoded);
    if (!text(cursor.sort) || !text(cursor.primary) || !text(cursor.key)) throw new Error();
    return cursor;
  } catch {
    throw new Error("The conversation page cursor is invalid or no longer matches this view.");
  }
}
