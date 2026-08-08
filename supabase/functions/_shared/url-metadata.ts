import { decodeEntities, firstMeta, firstTag, stripMarkup } from "./content.ts";
import { assertPublicUrl, fetchPublicDocument } from "./security.ts";

export interface ExtractedUrlMetadata {
  originalUrl: string;
  finalUrl: string;
  canonicalUrl: string;
  title: string;
  description?: string;
  author?: string;
  publication: string;
  publishedAt?: string;
  previewImage?: string;
  extractedAt: string;
}

export async function extractUrlMetadata(input: string): Promise<ExtractedUrlMetadata> {
  const originalUrl = assertPublicUrl(input).toString();
  const document = await fetchPublicDocument(originalUrl, ["text/html", "application/xhtml+xml"]);
  return metadataFromHtml(document.text, originalUrl, document.finalUrl);
}

export function metadataFromHtml(html: string, originalUrl: string, finalUrl: string, now = () => new Date()) {
  const fallbackUrl = assertPublicUrl(finalUrl);
  const canonicalUrl = publicMetadataUrl(firstLink(html, "canonical"), fallbackUrl) || fallbackUrl.toString();
  const title = cleanText(firstMeta(html, ["og:title", "twitter:title"]) || firstTag(html, ["title"]), 300)
    || fallbackUrl.hostname.replace(/^www\./, "");
  const description = cleanText(firstMeta(html, ["description", "og:description", "twitter:description"]), 2_000);
  const author = cleanText(firstMeta(html, ["author", "article:author", "parsely-author"]), 300);
  const publication = cleanText(firstMeta(html, ["og:site_name", "application-name"]), 300)
    || fallbackUrl.hostname.replace(/^www\./, "");
  const publishedAt = normalizedPublishedDate(firstMeta(html, [
    "article:published_time",
    "datePublished",
    "date",
    "parsely-pub-date",
  ]));
  const previewImage = publicMetadataUrl(firstMeta(html, ["og:image", "twitter:image", "twitter:image:src"]), fallbackUrl);

  return {
    originalUrl: assertPublicUrl(originalUrl).toString(),
    finalUrl: fallbackUrl.toString(),
    canonicalUrl,
    title,
    ...(description ? { description } : {}),
    ...(author ? { author } : {}),
    publication,
    ...(publishedAt ? { publishedAt } : {}),
    ...(previewImage ? { previewImage } : {}),
    extractedAt: now().toISOString(),
  } satisfies ExtractedUrlMetadata;
}

export function comparableUrl(input: string) {
  try {
    const url = assertPublicUrl(input);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

function firstLink(html: string, relation: string) {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const rel = attribute(tag, "rel").toLowerCase().split(/\s+/);
    const href = attribute(tag, "href");
    if (rel.includes(relation.toLowerCase()) && href) return decodeEntities(href.trim());
  }
  return "";
}

function attribute(tag: string, name: string) {
  const quoted = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  if (quoted?.[2]) return quoted[2];
  const unquoted = tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return unquoted?.[1] ?? "";
}

function publicMetadataUrl(value: string, base: URL) {
  if (!value) return "";
  try {
    return assertPublicUrl(new URL(value, base).toString()).toString();
  } catch {
    return "";
  }
}

function cleanText(value: string, maximum: number) {
  return stripMarkup(value).replace(/\s+/g, " ").trim().slice(0, maximum);
}

function normalizedPublishedDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
