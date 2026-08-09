import { firstMeta, matchesMonitor, stableId, stripMarkup, validDate } from "./content.ts";
import { fetchPublicDocument } from "./security.ts";
import type { MonitorInput, NormalizedMention } from "./types.ts";

export async function collectManualUrls(urls: string[], monitor: MonitorInput, signal?: AbortSignal) {
  const mentions: NormalizedMention[] = [];
  const failures: string[] = [];
  for (const url of urls.slice(0, 10)) {
    signal?.throwIfAborted();
    try {
      const mention = await collectPage(url, monitor, signal);
      if (mention) mentions.push(mention);
    } catch (error) {
      signal?.throwIfAborted();
      failures.push(error instanceof Error ? error.message : "URL import failed.");
    }
  }
  return { mentions, failures };
}

async function collectPage(url: string, monitor: MonitorInput, signal?: AbortSignal): Promise<NormalizedMention | null> {
  const fetchedAt = new Date().toISOString();
  const document = await fetchPublicDocument(url, ["text/html", "application/xhtml"], signal);
  const title = firstMeta(document.text, ["og:title", "twitter:title"])
    || stripMarkup(document.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
    || new URL(document.finalUrl).hostname;
  const description = firstMeta(document.text, ["description", "og:description", "twitter:description"]);
  const articleText = stripMarkup(document.text.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || "").slice(0, 10_000);
  const content = [title, description, articleText].filter(Boolean).join(". ").slice(0, 12_000);
  if (!content || !matchesMonitor(content, monitor.builder)) return null;
  const author = firstMeta(document.text, ["author", "article:author"]) || new URL(document.finalUrl).hostname;
  const published = firstMeta(document.text, ["article:published_time", "date", "datePublished"]);
  const externalId = stableId(document.finalUrl);
  return {
    id: `manual-${externalId}`,
    platform: "manual",
    externalId,
    author,
    content,
    url: document.finalUrl,
    publishedAt: validDate(published, fetchedAt),
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    engagement: 0,
    language: monitor.language === "Any language" ? undefined : monitor.language,
    metadata: { sourceLabel: new URL(document.finalUrl).hostname, sourceType: "manual_url", fetchedAt },
  };
}
