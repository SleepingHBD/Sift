import { firstTag, matchesMonitor, stableId, stripMarkup, validDate } from "./content.ts";
import { fetchPublicDocument } from "./security.ts";
import type { MonitorInput, NormalizedMention } from "./types.ts";

export async function collectRssFeeds(urls: string[], monitor: MonitorInput, signal?: AbortSignal) {
  const mentions: NormalizedMention[] = [];
  const failures: string[] = [];
  for (const url of urls.slice(0, 10)) {
    signal?.throwIfAborted();
    try {
      mentions.push(...await collectFeed(url, monitor, signal));
    } catch (error) {
      signal?.throwIfAborted();
      failures.push(error instanceof Error ? error.message : "Feed retrieval failed.");
    }
  }
  return { mentions, failures };
}

async function collectFeed(url: string, monitor: MonitorInput, signal?: AbortSignal): Promise<NormalizedMention[]> {
  const fetchedAt = new Date().toISOString();
  const document = await fetchPublicDocument(url, ["xml", "rss", "atom", "text/plain"], signal);
  const feedTitle = firstTag(document.text, ["title"]) || new URL(document.finalUrl).hostname;
  const blocks = document.text.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  return blocks.slice(0, 50).map((block) => {
    const title = firstTag(block, ["title"]);
    const summary = firstTag(block, ["content:encoded", "description", "summary", "content"]);
    const content = stripMarkup([title, summary].filter(Boolean).join(". ")).slice(0, 12_000);
    const link = extractLink(block, document.finalUrl);
    const guid = firstTag(block, ["guid", "id"]) || link || `${title}:${firstTag(block, ["pubDate", "published", "updated"])}`;
    const publishedAt = validDate(firstTag(block, ["pubDate", "published", "updated", "dc:date"]), fetchedAt);
    const author = firstTag(block, ["author", "dc:creator", "name"]) || feedTitle;
    return {
      id: `rss-${stableId(guid)}`,
      platform: "rss" as const,
      externalId: stableId(guid),
      author,
      content,
      url: link || undefined,
      publishedAt,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      engagement: 0,
      language: monitor.language === "Any language" ? undefined : monitor.language,
      metadata: { sourceLabel: feedTitle, feedUrl: document.finalUrl, sourceType: "rss" },
    };
  }).filter((mention) => mention.content && matchesMonitor(mention.content, monitor.builder));
}

function extractLink(block: string, baseUrl: string) {
  const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];
  const text = firstTag(block, ["link"]);
  const value = href || text;
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}
