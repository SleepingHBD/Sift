const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

type DenoDnsRuntime = {
  resolveDns?: (hostname: string, recordType: "A" | "AAAA") => Promise<string[]>;
};

export interface PublicDocument {
  finalUrl: string;
  text: string;
  contentType: string;
}

export async function fetchPublicDocument(input: string, acceptedTypes: string[], signal?: AbortSignal): Promise<PublicDocument> {
  return fetchWithRedirects(assertPublicUrl(input), acceptedTypes, 0, signal);
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

async function fetchWithRedirects(url: URL, acceptedTypes: string[], depth: number, signal?: AbortSignal): Promise<PublicDocument> {
  if (depth > MAX_REDIRECTS) throw new Error("The source redirected too many times.");
  await assertPublicDns(url.hostname);
  const response = await fetch(url, {
    redirect: "manual",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000),
    headers: { "user-agent": "Sift-Radar/1.0 (+permitted-source-ingestion)" },
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("The source returned an invalid redirect.");
    return fetchWithRedirects(assertPublicUrl(new URL(location, url).toString()), acceptedTypes, depth + 1, signal);
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

export function isBlockedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.includes(":")) return isBlockedIpv6(host);
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

async function assertPublicDns(hostname: string) {
  if (isBlockedHostname(hostname)) throw new Error("Private or local network URLs are not allowed.");
  if (isIpLiteral(hostname)) return;

  const runtime = (globalThis as typeof globalThis & { Deno?: DenoDnsRuntime }).Deno;
  if (!runtime?.resolveDns) throw new Error("The server could not validate the source network address.");
  const lookups = await Promise.allSettled([
    runtime.resolveDns(hostname, "A"),
    runtime.resolveDns(hostname, "AAAA"),
  ]);
  const addresses = lookups.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!addresses.length) throw new Error("The source hostname could not be resolved.");
  if (addresses.some(isBlockedHostname)) throw new Error("The source resolves to a private or local network address.");
}

function isIpLiteral(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "");
  return host.includes(":") || host.split(".").every((part) => /^\d+$/.test(part));
}

function isBlockedIpv6(host: string) {
  const normalized = host.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (/^(fc|fd)/.test(normalized) || /^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("2001:db8:")) return true;

  const mapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isBlockedHostname(mapped[1]);
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    return isBlockedHostname(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return false;
}
