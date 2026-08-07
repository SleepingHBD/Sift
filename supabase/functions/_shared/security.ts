const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

export interface PublicDocument {
  finalUrl: string;
  text: string;
  contentType: string;
}

export async function fetchPublicDocument(input: string, acceptedTypes: string[]): Promise<PublicDocument> {
  return fetchWithRedirects(assertPublicUrl(input), acceptedTypes, 0);
}

export function assertPublicUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("A configured source URL is invalid.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS source URLs are allowed.");
  if (url.username || url.password) throw new Error("Source URLs cannot contain credentials.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Source URLs must use a standard web port.");
  if (isBlockedHostname(url.hostname)) throw new Error("Private or local network URLs are not allowed.");
  return url;
}

async function fetchWithRedirects(url: URL, acceptedTypes: string[], depth: number): Promise<PublicDocument> {
  if (depth > MAX_REDIRECTS) throw new Error("The source redirected too many times.");
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
    headers: { "user-agent": "Sift-Radar/1.0 (+permitted-source-ingestion)" },
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("The source returned an invalid redirect.");
    return fetchWithRedirects(assertPublicUrl(new URL(location, url).toString()), acceptedTypes, depth + 1);
  }
  if (!response.ok) throw new Error(`The source returned HTTP ${response.status}.`);

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!acceptedTypes.some((type) => contentType.includes(type))) throw new Error(`Unsupported source content type: ${contentType || "unknown"}.`);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_BYTES) throw new Error("The source is larger than the 2 MB ingestion limit.");

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("The source is larger than the 2 MB ingestion limit.");
  return { finalUrl: url.toString(), text: new TextDecoder().decode(bytes), contentType };
}

function isBlockedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}
