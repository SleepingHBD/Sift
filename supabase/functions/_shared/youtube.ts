import { decodeEntities } from "./content.ts";
import type { ConnectorCursor, MonitorInput, NormalizedMention } from "./types.ts";

const API_ROOT = "https://www.googleapis.com/youtube/v3";

interface SearchItem {
  id?: { videoId?: string };
  snippet?: { title?: string; description?: string; channelTitle?: string; publishedAt?: string };
}

interface CommentThread {
  snippet?: { topLevelComment?: { id?: string; snippet?: { authorDisplayName?: string; authorChannelUrl?: string; textOriginal?: string; textDisplay?: string; likeCount?: number; publishedAt?: string; updatedAt?: string } } };
}

export async function collectYouTube(monitor: MonitorInput, apiKey: string, signal?: AbortSignal, cursor?: ConnectorCursor) {
  if (!apiKey) throw new Error("YouTube is enabled, but YOUTUBE_API_KEY is not configured in Function secrets.");
  const query = buildYouTubeQuery(monitor);
  if (!query) throw new Error("The monitor does not contain a YouTube search term.");
  const publishedAfter = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const search = await googleRequest<{ items?: SearchItem[] }>("search", {
    part: "snippet",
    q: query,
    type: "video",
    order: "relevance",
    maxResults: "5",
    publishedAfter,
    safeSearch: "moderate",
    key: apiKey,
  }, signal);
  const items = (search.items ?? []).filter((item) => item.id?.videoId);
  const videoIds = items.map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
  const statistics = videoIds.length ? await googleRequest<{ items?: { id?: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }>("videos", {
    part: "statistics",
    id: videoIds.join(","),
    key: apiKey,
  }, signal) : { items: [] };
  const stats = new Map((statistics.items ?? []).map((item) => [item.id, item.statistics]));
  const mentions: NormalizedMention[] = [];

  for (const item of items) {
    signal?.throwIfAborted();
    const videoId = item.id?.videoId;
    if (!videoId) continue;
    const snippet = item.snippet ?? {};
    const metric = stats.get(videoId) ?? {};
    const views = integer(metric.viewCount);
    const likes = integer(metric.likeCount);
    const comments = integer(metric.commentCount);
    mentions.push({
      id: `youtube-video-${videoId}`,
      platform: "youtube",
      externalId: `video:${videoId}`,
      author: snippet.channelTitle || "YouTube channel",
      content: [snippet.title, snippet.description].filter(Boolean).map(decodeEntities).join(". ").slice(0, 12_000),
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      publishedAt: snippet.publishedAt || new Date().toISOString(),
      likes,
      comments,
      shares: 0,
      views,
      engagement: Math.round(likes + comments * 2 + views * 0.015),
      language: monitor.language === "Any language" ? undefined : monitor.language,
      metadata: { sourceLabel: "YouTube video", sourceType: "youtube_video", videoId },
    });

    try {
      const commentResponse = await googleRequest<{ items?: CommentThread[] }>("commentThreads", {
        part: "snippet",
        videoId,
        maxResults: "20",
        order: "relevance",
        textFormat: "plainText",
        key: apiKey,
      }, signal);
      for (const thread of commentResponse.items ?? []) {
        const comment = thread.snippet?.topLevelComment;
        const commentSnippet = comment?.snippet;
        if (!comment?.id || !commentSnippet) continue;
        const commentLikes = integer(commentSnippet.likeCount);
        mentions.push({
          id: `youtube-comment-${comment.id}`,
          platform: "youtube",
          externalId: `comment:${comment.id}`,
          author: commentSnippet.authorDisplayName || "YouTube user",
          content: commentSnippet.textOriginal || decodeEntities(commentSnippet.textDisplay || ""),
          url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&lc=${encodeURIComponent(comment.id)}`,
          publishedAt: commentSnippet.publishedAt || commentSnippet.updatedAt || new Date().toISOString(),
          likes: commentLikes,
          comments: 0,
          shares: 0,
          views: 0,
          engagement: commentLikes,
          language: monitor.language === "Any language" ? undefined : monitor.language,
          metadata: { sourceLabel: "YouTube comment", sourceType: "youtube_comment", videoId, parentVideoTitle: snippet.title, authorChannelUrl: commentSnippet.authorChannelUrl },
        });
      }
    } catch {
      signal?.throwIfAborted();
      // Comments may be disabled for an otherwise valid video. Keep the video result.
    }
  }
  const validMentions = mentions.filter((mention) => mention.content);
  const previousIds = stringArray(cursor?.recentExternalIds, 500);
  const seen = new Set(previousIds);
  return {
    mentions: validMentions.filter((mention) => !seen.has(mention.externalId)),
    cursor: { recentExternalIds: [...new Set([...validMentions.map((mention) => mention.externalId), ...previousIds])].slice(0, 500) },
  };
}

function stringArray(value: unknown, maximum: number) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, maximum) : [];
}

function buildYouTubeQuery(monitor: MonitorInput) {
  const all = monitor.builder.includeAll.filter(Boolean).map((term) => quote(term));
  const any = monitor.builder.includeAny.filter(Boolean).map((term) => quote(term));
  const excluded = monitor.builder.exclude.filter(Boolean).map((term) => `-${quote(term)}`);
  return [...all, any.length ? any.join("|") : "", ...excluded].filter(Boolean).join(" ").slice(0, 300);
}

function quote(value: string) {
  const cleaned = value.trim().replace(/["|]/g, " ");
  return cleaned.includes(" ") ? `"${cleaned}"` : cleaned;
}

async function googleRequest<T>(resource: string, parameters: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = new URL(`${API_ROOT}/${resource}`);
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000) });
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || `YouTube API returned HTTP ${response.status}.`);
  return body;
}

function integer(value: string | number | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}
